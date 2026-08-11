import hre from "hardhat";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { AppConfig } from "../src/config.js";
import { NftMinter } from "../src/minter.js";

const baseCard = {
  id: 123,
  cardCode: "KOR-S01-COM-00001",
  caseId: "CASE-KOR-S01-COM-00001-000001",
  designId: "KOR-S01-COM-00001",
  serialNo: 1,
  seasonSerialNo: 1,
  editionSize: 2500,
  cardName: "Signal Kitten",
  rarityCode: "COM",
  seasonCode: "S01",
  imageUrl: "https://metadata.example/cards/KOR-S01-COM-00001.png"
};

async function buildApp() {
  const [deployer, recipient] = await hre.ethers.getSigners();
  const factory = await hre.ethers.getContractFactory("KorionCardItems");
  const contract = await factory.deploy("", deployer.address);
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  const config: AppConfig = {
    port: 0,
    apiKey: "test-api-key",
    privateKey: "unused-test-key",
    networkEnv: "hardhat",
    network: {
      chain: "POLYGON_AMOY",
      chainId: 31337,
      rpcUrl: "http://127.0.0.1:8545",
      contractAddress
    }
  };
  const minter = new NftMinter({
    network: config.network,
    privateKey: config.privateKey,
    signer: deployer as never
  });

  return {
    app: createApp({ config, minter }),
    config,
    contract,
    deployer,
    recipient
  };
}

describe("POST /mint", () => {
  let ctx: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    ctx = await buildApp();
  });

  it("reports the exact custody deployment used for deposit readiness checks", async () => {
    const response = await request(ctx.app)
      .get("/health")
      .expect(200);

    expect(response.body).toMatchObject({
      ok: true,
      networkEnv: "hardhat",
      chain: "POLYGON_AMOY",
      chainId: 31337,
      contractAddress: await ctx.contract.getAddress(),
      custodyAddress: ctx.deployer.address,
      contractConfigured: true,
      claimReady: true,
      gasReady: true,
      nativeCurrency: "POL"
    });
    expect(BigInt(response.body.nativeBalanceWei)).toBeGreaterThan(0n);
    expect(BigInt(response.body.estimatedMintFeeWei)).toBeGreaterThan(0n);
  });

  it("does not burst readiness RPC calls before the previous request completes", async () => {
    let balanceResolved = false;
    const provider = {
      getBalance: async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        balanceResolved = true;
        return 1_000_000_000_000_000_000n;
      },
      getFeeData: async () => {
        if (!balanceResolved) throw new Error("RPC burst rejected");
        return { gasPrice: 1n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n };
      },
    };
    const minter = new NftMinter({
      network: ctx.config.network,
      privateKey: ctx.config.privateKey,
      provider: provider as never,
      signer: ctx.deployer as never,
    });

    await expect(minter.readiness()).resolves.toMatchObject({
      gasReady: true,
      nativeBalanceWei: "1000000000000000000",
    });
  });

  it("verifies a confirmed user gas deposit to the custody wallet", async () => {
    const requiredAmount = 1_000_000_000_000_000n;
    const tx = await ctx.recipient.sendTransaction({
      to: ctx.deployer.address,
      value: requiredAmount,
    });
    await tx.wait();

    const response = await request(ctx.app)
      .post("/gas-deposits/verify")
      .set("X-API-Key", "test-api-key")
      .send({
        txHash: tx.hash,
        minimumAmountWei: requiredAmount.toString(),
        minConfirmations: 1,
      })
      .expect(200);

    expect(response.body).toMatchObject({
      verified: true,
      txHash: tx.hash,
      fromAddress: ctx.recipient.address,
      depositAddress: ctx.deployer.address,
      amountWei: requiredAmount.toString(),
      confirmations: 1,
      chain: "POLYGON_AMOY",
      chainId: 31337,
    });
  });

  it("rejects a gas deposit below the quoted amount", async () => {
    const tx = await ctx.recipient.sendTransaction({
      to: ctx.deployer.address,
      value: 1n,
    });
    await tx.wait();

    const response = await request(ctx.app)
      .post("/gas-deposits/verify")
      .set("X-API-Key", "test-api-key")
      .send({
        txHash: tx.hash,
        minimumAmountWei: "1000",
        minConfirmations: 1,
      })
      .expect(200);

    expect(response.body).toMatchObject({
      verified: false,
      reason: "AMOUNT_INSUFFICIENT",
      fromAddress: ctx.recipient.address,
      amountWei: "1",
    });
  });

  it("requires the internal API key for gas deposit verification", async () => {
    await request(ctx.app)
      .post("/gas-deposits/verify")
      .send({
        txHash: `0x${"a".repeat(64)}`,
        minimumAmountWei: "1",
        minConfirmations: 1,
      })
      .expect(401);
  });

  it("mints one ERC-1155 card on the configured Polygon testnet profile", async () => {
    const response = await request(ctx.app)
      .post("/mint")
      .set("X-API-Key", "test-api-key")
      .set("Idempotency-Key", "card-gatcha-nft:123")
      .send({
        idempotencyKey: "card-gatcha-nft:123",
        chain: "POLYGON_AMOY",
        contractAddress: await ctx.contract.getAddress(),
        recipientAddress: ctx.recipient.address,
        tokenUri: "https://metadata.example/cards/KOR-S01-COM-00001-000001.json",
        card: baseCard
      })
      .expect(200);

    expect(response.body.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(response.body.contractAddress).toBe(await ctx.contract.getAddress());
    expect(response.body.chain).toBe("POLYGON_AMOY");
    expect(response.body.chainId).toBe(31337);
    expect(response.body.tokenId).toMatch(/^[0-9]+$/);
  });

  it("returns the cached result for duplicate in-process idempotency keys", async () => {
    const payload = {
      idempotencyKey: "card-gatcha-nft:duplicate",
      chain: "POLYGON_AMOY",
      contractAddress: await ctx.contract.getAddress(),
      recipientAddress: ctx.recipient.address,
      tokenUri: "https://metadata.example/cards/duplicate.json",
      card: { ...baseCard, id: 124, caseId: "CASE-KOR-S01-COM-00001-000002", serialNo: 2, seasonSerialNo: 2 }
    };

    const first = await request(ctx.app)
      .post("/mint")
      .set("X-API-Key", "test-api-key")
      .set("Idempotency-Key", payload.idempotencyKey)
      .send(payload)
      .expect(200);

    const second = await request(ctx.app)
      .post("/mint")
      .set("X-API-Key", "test-api-key")
      .set("Idempotency-Key", payload.idempotencyKey)
      .send(payload)
      .expect(200);

    expect(second.body).toEqual(first.body);
  });

  it("resolves duplicate idempotency keys from on-chain events after app restart", async () => {
    const [deployer] = await hre.ethers.getSigners();
    const contractAddress = await ctx.contract.getAddress();
    const config: AppConfig = {
      port: 0,
      apiKey: "test-api-key",
      privateKey: "unused-test-key",
      networkEnv: "hardhat",
      network: {
        chain: "POLYGON_AMOY",
        chainId: 31337,
        rpcUrl: "http://127.0.0.1:8545",
        contractAddress
      }
    };
    const restartedApp = createApp({
      config,
      minter: new NftMinter({
        network: config.network,
        privateKey: config.privateKey,
        signer: deployer as never
      })
    });
    const payload = {
      idempotencyKey: "card-gatcha-nft:restart",
      chain: "POLYGON_AMOY",
      contractAddress,
      recipientAddress: ctx.recipient.address,
      tokenUri: "https://metadata.example/cards/restart.json",
      card: { ...baseCard, id: 125, caseId: "CASE-KOR-S01-COM-00001-000003", serialNo: 3, seasonSerialNo: 3 }
    };

    const first = await request(ctx.app)
      .post("/mint")
      .set("X-API-Key", "test-api-key")
      .set("Idempotency-Key", payload.idempotencyKey)
      .send(payload)
      .expect(200);

    const second = await request(restartedApp)
      .post("/mint")
      .set("X-API-Key", "test-api-key")
      .set("Idempotency-Key", payload.idempotencyKey)
      .send(payload)
      .expect(200);

    expect(second.body).toEqual(first.body);
  });

  it("queries duplicate mint events from the configured deployment block", async () => {
    const [deployer] = await hre.ethers.getSigners();
    const deploymentReceipt = await ctx.contract.deploymentTransaction()!.wait();
    const contractAddress = await ctx.contract.getAddress();
    const config: AppConfig = {
      port: 0,
      apiKey: "test-api-key",
      privateKey: "unused-test-key",
      networkEnv: "hardhat",
      network: {
        chain: "POLYGON_AMOY",
        chainId: 31337,
        rpcUrl: "http://127.0.0.1:8545",
        contractAddress
      }
    };
    Object.assign(config.network, { deploymentBlock: deploymentReceipt!.blockNumber });
    const restartedApp = createApp({
      config,
      minter: new NftMinter({
        network: config.network,
        privateKey: config.privateKey,
        signer: deployer as never
      })
    });
    const payload = {
      idempotencyKey: "card-gatcha-nft:deployment-block",
      chain: "POLYGON_AMOY",
      contractAddress,
      recipientAddress: ctx.recipient.address,
      tokenUri: "https://metadata.example/cards/deployment-block.json",
      card: { ...baseCard, id: 126, caseId: "CASE-KOR-S01-COM-00001-000004", serialNo: 4, seasonSerialNo: 4 }
    };

    await request(ctx.app)
      .post("/mint")
      .set("X-API-Key", "test-api-key")
      .set("Idempotency-Key", payload.idempotencyKey)
      .send(payload)
      .expect(200);

    const getLogs = vi.spyOn(hre.ethers.provider, "getLogs");
    await request(restartedApp)
      .post("/mint")
      .set("X-API-Key", "test-api-key")
      .set("Idempotency-Key", payload.idempotencyKey)
      .send(payload)
      .expect(200);

    expect(getLogs).toHaveBeenCalledWith(expect.objectContaining({ fromBlock: deploymentReceipt!.blockNumber }));
  });

  it("rejects mismatched chain requests before signing", async () => {
    await request(ctx.app)
      .post("/mint")
      .set("X-API-Key", "test-api-key")
      .set("Idempotency-Key", "card-gatcha-nft:wrong-chain")
      .send({
        idempotencyKey: "card-gatcha-nft:wrong-chain",
        chain: "TRON",
        contractAddress: await ctx.contract.getAddress(),
        recipientAddress: ctx.recipient.address,
        card: baseCard
      })
      .expect(400)
      .expect((response) => {
        expect(response.body.code).toBe("CHAIN_MISMATCH");
      });
  });

  it("requires the configured API key", async () => {
    await request(ctx.app)
      .post("/mint")
      .send({
        idempotencyKey: "card-gatcha-nft:no-auth",
        chain: "POLYGON_AMOY",
        recipientAddress: ctx.recipient.address,
        card: baseCard
      })
      .expect(401);
  });

  it("prepares a one-time claim paid by MetaMask and sends the NFT to the entered recipient", async () => {
    const [, payer, nftRecipient] = await hre.ethers.getSigners();
    const payload = {
      idempotencyKey: "card-gatcha-claim:123",
      chain: "POLYGON_AMOY",
      contractAddress: await ctx.contract.getAddress(),
      recipientAddress: nftRecipient.address,
      tokenUri: "https://metadata.example/cards/claim-123.json",
      card: baseCard,
    };

    const prepared = await request(ctx.app)
      .post("/claims/prepare")
      .set("X-API-Key", "test-api-key")
      .send(payload)
      .expect(200);

    expect(prepared.body).toMatchObject({
      chain: "POLYGON_AMOY",
      chainId: 31337,
      contractAddress: await ctx.contract.getAddress(),
      recipientAddress: nftRecipient.address,
      value: "0x0",
    });
    expect(prepared.body.data).toMatch(/^0x[a-fA-F0-9]+$/);
    expect(prepared.body.requestHash).toMatch(/^0x[a-fA-F0-9]{64}$/);

    const tx = await payer.sendTransaction({
      to: prepared.body.contractAddress,
      data: prepared.body.data,
      value: prepared.body.value,
    });
    await tx.wait();

    const verified = await request(ctx.app)
      .post("/claims/verify")
      .set("X-API-Key", "test-api-key")
      .send({
        txHash: tx.hash,
        requestHash: prepared.body.requestHash,
        recipientAddress: nftRecipient.address,
        tokenId: prepared.body.tokenId,
        minConfirmations: 1,
      })
      .expect(200);

    expect(verified.body).toMatchObject({
      verified: true,
      txHash: tx.hash,
      requestHash: prepared.body.requestHash,
      recipientAddress: nftRecipient.address,
      tokenId: prepared.body.tokenId,
      payerAddress: payer.address,
    });

    expect(await ctx.contract.balanceOf(nftRecipient.address, prepared.body.tokenId)).toBe(1n);
    expect(await ctx.contract.balanceOf(payer.address, prepared.body.tokenId)).toBe(0n);
    await expect(payer.sendTransaction({
      to: prepared.body.contractAddress,
      data: prepared.body.data,
      value: prepared.body.value,
    })).rejects.toThrow(/request already claimed/i);
  });

  it("requires the internal API key when preparing a claim", async () => {
    await request(ctx.app)
      .post("/claims/prepare")
      .send({
        idempotencyKey: "card-gatcha-claim:no-auth",
        recipientAddress: ctx.recipient.address,
        card: baseCard,
      })
      .expect(401);
  });

  it("releases a deposited ERC-1155 card from the custody signer without minting another token", async () => {
    const [deployer] = await hre.ethers.getSigners();
    const tokenId = 987654321n;
    const depositFixture = await ctx.contract.mintCard(
      deployer.address,
      tokenId,
      1,
      "",
      hre.ethers.id("custody-deposit-fixture"),
    );
    const depositReceipt = await depositFixture.wait();
    const supplyBefore = await ctx.contract.balanceOf(deployer.address, tokenId)
      + await ctx.contract.balanceOf(ctx.recipient.address, tokenId);

    const response = await request(ctx.app)
      .post("/transfer")
      .set("X-API-Key", "test-api-key")
      .set("Idempotency-Key", "card-gatcha-transfer:123")
      .send({
        idempotencyKey: "card-gatcha-transfer:123",
        chain: "POLYGON_AMOY",
        contractAddress: await ctx.contract.getAddress(),
        recipientAddress: ctx.recipient.address,
        custodyAddress: deployer.address,
        tokenId: tokenId.toString(),
        amount: "1",
        sourceTxHash: depositReceipt!.hash,
      })
      .expect(200);

    expect(response.body.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(response.body.tokenId).toBe(tokenId.toString());
    expect(await ctx.contract.balanceOf(ctx.recipient.address, tokenId)).toBe(1n);
    const supplyAfter = await ctx.contract.balanceOf(deployer.address, tokenId)
      + await ctx.contract.balanceOf(ctx.recipient.address, tokenId);
    expect(supplyAfter).toBe(supplyBefore);

    const restartedApp = createApp({
      config: ctx.config,
      minter: new NftMinter({
        network: ctx.config.network,
        privateKey: ctx.config.privateKey,
        signer: ctx.deployer as never,
      }),
    });
    const duplicate = await request(restartedApp)
      .post("/transfer")
      .set("X-API-Key", "test-api-key")
      .set("Idempotency-Key", "card-gatcha-transfer:123")
      .send({
        idempotencyKey: "card-gatcha-transfer:123",
        chain: "POLYGON_AMOY",
        contractAddress: await ctx.contract.getAddress(),
        recipientAddress: ctx.recipient.address,
        custodyAddress: deployer.address,
        tokenId: tokenId.toString(),
        amount: "1",
        sourceTxHash: depositReceipt!.hash,
      })
      .expect(200);
    expect(duplicate.body.txHash).toBe(response.body.txHash);

    await request(restartedApp)
      .post("/transfer")
      .set("X-API-Key", "test-api-key")
      .set("Idempotency-Key", "card-gatcha-transfer:wrong-custody")
      .send({
        idempotencyKey: "card-gatcha-transfer:wrong-custody",
        chain: "POLYGON_AMOY",
        contractAddress: await ctx.contract.getAddress(),
        recipientAddress: ctx.recipient.address,
        custodyAddress: ctx.recipient.address,
        tokenId: tokenId.toString(),
        amount: "1",
        sourceTxHash: depositReceipt!.hash,
      })
      .expect(400)
      .expect((failure) => expect(failure.body.code).toBe("CUSTODY_ADDRESS_MISMATCH"));
  });

  it("rejects an invalid private key without echoing the configured value", () => {
    const invalidPrivateKey = "replace-with-private-key";

    expect(() => new NftMinter({
      network: {
        chain: "POLYGON_AMOY",
        chainId: 80002,
        rpcUrl: "https://polygon-amoy.drpc.org",
        contractAddress: "0x0000000000000000000000000000000000000001"
      },
      privateKey: invalidPrivateKey
    })).toThrow("MINTER_PRIVATE_KEY must be a 32-byte hex string.");

    try {
      new NftMinter({
        network: {
          chain: "POLYGON_AMOY",
          chainId: 80002,
          rpcUrl: "https://polygon-amoy.drpc.org",
          contractAddress: "0x0000000000000000000000000000000000000001"
        },
        privateKey: invalidPrivateKey
      });
    } catch (error) {
      expect(String(error)).not.toContain(invalidPrivateKey);
    }
  });
});
