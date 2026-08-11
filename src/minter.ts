import { ethers } from "ethers";
import { NetworkConfig } from "./config.js";
import { MintRequest, tokenIdFor } from "./mint-request.js";
import { normalizePrivateKey } from "./private-key.js";
import { TransferRequest } from "./transfer-request.js";
import { GasDepositVerificationRequest } from "./gas-deposit-request.js";

const contractAbi = [
  "function mintCard(address recipient,uint256 tokenId,uint256 amount,string tokenUri,bytes32 requestHash) external",
  "function mintedRequests(bytes32 requestHash) external view returns (bool)",
  "function balanceOf(address account,uint256 id) external view returns (uint256)",
  "function safeTransferFrom(address from,address to,uint256 id,uint256 amount,bytes data) external",
  "event TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value)",
  "event CardMinted(bytes32 indexed requestHash,address indexed recipient,uint256 indexed tokenId,uint256 amount,string tokenUri)"
];

export interface MintResult {
  txHash: string;
  tokenId: string;
  contractAddress: string;
  tokenUri?: string;
  chain: string;
  chainId: number;
}

export interface MinterReadiness {
  gasReady: boolean;
  nativeCurrency: "POL" | "ETH";
  nativeBalanceWei: string;
  estimatedMintFeeWei: string;
}

export interface MinterOptions {
  network: NetworkConfig;
  privateKey: string;
  provider?: ethers.Provider;
  signer?: ethers.ContractRunner;
}

export interface GasDepositVerificationResult {
  verified: boolean;
  reason?: "TX_NOT_FOUND" | "TX_PENDING" | "TX_FAILED" | "RECIPIENT_MISMATCH" | "AMOUNT_INSUFFICIENT" | "CONFIRMATIONS_PENDING";
  txHash: string;
  fromAddress?: string;
  depositAddress: string;
  amountWei?: string;
  confirmations: number;
  blockNumber?: number;
  blockTimestamp?: number;
  chain: string;
  chainId: number;
}

export class NftMinter {
  private readonly provider: ethers.Provider;
  private readonly signer: ethers.ContractRunner;
  private readonly network: NetworkConfig;

  constructor(options: MinterOptions) {
    this.network = options.network;
    const fallbackProvider = options.provider || new ethers.JsonRpcProvider(options.network.rpcUrl, options.network.chainId);
    this.signer = options.signer || new ethers.Wallet(normalizePrivateKey(options.privateKey), fallbackProvider);
    this.provider = options.provider || (this.signer as ethers.Signer).provider || fallbackProvider;
  }

  isConfigured(): boolean {
    return Boolean(this.network.contractAddress && this.network.contractAddress.trim());
  }

  async custodyAddress(): Promise<string> {
    return (this.signer as ethers.Signer).getAddress();
  }

  async readiness(): Promise<MinterReadiness> {
    if (!this.isConfigured()) {
      return {
        gasReady: false,
        nativeCurrency: this.nativeCurrency(),
        nativeBalanceWei: "0",
        estimatedMintFeeWei: "0",
      };
    }
    const custodyAddress = await this.custodyAddress();
    const contract = new ethers.Contract(this.network.contractAddress, contractAbi, this.signer);
    const [nativeBalance, feeData, gasUnits] = await Promise.all([
      this.provider.getBalance(custodyAddress),
      this.provider.getFeeData(),
      contract.mintCard.estimateGas(
        custodyAddress,
        0n,
        1n,
        "",
        ethers.id("korion-nft-readiness-check"),
      ) as Promise<bigint>,
    ]);
    const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
    const estimatedMintFee = gasUnits * gasPrice * 120n / 100n;
    return {
      gasReady: gasPrice > 0n && nativeBalance >= estimatedMintFee,
      nativeCurrency: this.nativeCurrency(),
      nativeBalanceWei: nativeBalance.toString(),
      estimatedMintFeeWei: estimatedMintFee.toString(),
    };
  }

  async verifyGasDeposit(request: GasDepositVerificationRequest): Promise<GasDepositVerificationResult> {
    const depositAddress = await this.custodyAddress();
    const base = {
      txHash: request.txHash,
      depositAddress,
      confirmations: 0,
      chain: this.network.chain,
      chainId: this.network.chainId,
    };
    const tx = await this.provider.getTransaction(request.txHash);
    if (!tx) return { ...base, verified: false, reason: "TX_NOT_FOUND" };

    const receipt = await this.provider.getTransactionReceipt(request.txHash);
    if (!receipt || tx.blockNumber == null) {
      return { ...base, verified: false, reason: "TX_PENDING", fromAddress: tx.from, amountWei: tx.value.toString() };
    }
    const currentBlock = await this.provider.getBlockNumber();
    const confirmations = Math.max(0, currentBlock - tx.blockNumber + 1);
    const block = await this.provider.getBlock(tx.blockNumber);
    const details = {
      ...base,
      fromAddress: tx.from,
      amountWei: tx.value.toString(),
      confirmations,
      blockNumber: tx.blockNumber,
      blockTimestamp: block?.timestamp,
    };
    if (receipt.status !== 1) return { ...details, verified: false, reason: "TX_FAILED" };
    if (!tx.to || tx.to.toLowerCase() !== depositAddress.toLowerCase()) {
      return { ...details, verified: false, reason: "RECIPIENT_MISMATCH" };
    }
    if (tx.value < BigInt(request.minimumAmountWei)) {
      return { ...details, verified: false, reason: "AMOUNT_INSUFFICIENT" };
    }
    if (confirmations < request.minConfirmations) {
      return { ...details, verified: false, reason: "CONFIRMATIONS_PENDING" };
    }
    return { ...details, verified: true };
  }

  async mint(request: MintRequest): Promise<MintResult> {
    if (!this.isConfigured()) {
      throw badRequest("MINTER_NOT_CONFIGURED", "CONTRACT_ADDRESS is required.");
    }
    if (request.chain && request.chain !== this.network.chain) {
      throw badRequest("CHAIN_MISMATCH", `Request chain '${request.chain}' does not match '${this.network.chain}'.`);
    }
    if (request.contractAddress && request.contractAddress.toLowerCase() !== this.network.contractAddress.toLowerCase()) {
      throw badRequest("CONTRACT_MISMATCH", "Request contractAddress does not match configured contract.");
    }

    const requestHash = ethers.id(request.idempotencyKey);
    const tokenId = tokenIdFor(request);
    const contract = new ethers.Contract(this.network.contractAddress, contractAbi, this.signer);
    const alreadyMinted = await contract.mintedRequests(requestHash);
    if (alreadyMinted) {
      const existing = await this.findExistingMint(contract, requestHash, request);
      if (existing) {
        return existing;
      }
      throw conflict("ALREADY_MINTED", "Idempotency key was already minted on-chain but the original tx could not be resolved.");
    }

    const tx = await contract.mintCard(
      request.recipientAddress,
      tokenId,
      1,
      request.tokenUri || "",
      requestHash
    );
    const receipt = await tx.wait();
    if (!receipt?.hash) {
      throw new Error("Mint transaction receipt missing hash.");
    }

    return {
      txHash: receipt.hash,
      tokenId: tokenId.toString(),
      contractAddress: this.network.contractAddress,
      tokenUri: request.tokenUri,
      chain: this.network.chain,
      chainId: this.network.chainId
    };
  }

  async transfer(request: TransferRequest): Promise<MintResult> {
    if (!this.isConfigured()) {
      throw badRequest("MINTER_NOT_CONFIGURED", "CONTRACT_ADDRESS is required.");
    }
    if (request.chain && request.chain !== this.network.chain) {
      throw badRequest("CHAIN_MISMATCH", `Request chain '${request.chain}' does not match '${this.network.chain}'.`);
    }
    if (request.contractAddress && request.contractAddress.toLowerCase() !== this.network.contractAddress.toLowerCase()) {
      throw badRequest("CONTRACT_MISMATCH", "Request contractAddress does not match configured contract.");
    }

    const tokenId = BigInt(request.tokenId);
    const amount = BigInt(request.amount);
    const custodyAddress = await (this.signer as ethers.Signer).getAddress();
    if (request.custodyAddress.toLowerCase() !== custodyAddress.toLowerCase()) {
      throw badRequest("CUSTODY_ADDRESS_MISMATCH", "Configured custody address does not match the NFT signer.");
    }
    const contract = new ethers.Contract(this.network.contractAddress, contractAbi, this.signer);
    const existing = await this.findExistingTransfer(contract, custodyAddress, request);
    if (existing) {
      return existing;
    }
    const custodyBalance = BigInt(await contract.balanceOf(custodyAddress, tokenId));
    if (custodyBalance < amount) {
      throw conflict("CUSTODY_BALANCE_MISSING", "Custody wallet does not hold the requested NFT amount.");
    }
    const tx = await contract.safeTransferFrom(
      custodyAddress,
      request.recipientAddress,
      tokenId,
      amount,
      "0x",
    );
    const receipt = await tx.wait();
    if (!receipt?.hash) {
      throw new Error("Transfer transaction receipt missing hash.");
    }
    return {
      txHash: receipt.hash,
      tokenId: tokenId.toString(),
      contractAddress: this.network.contractAddress,
      chain: this.network.chain,
      chainId: this.network.chainId,
    };
  }

  private async findExistingTransfer(
    contract: ethers.Contract,
    custodyAddress: string,
    request: TransferRequest,
  ): Promise<MintResult | null> {
    const sourceReceipt = await this.provider.getTransactionReceipt(request.sourceTxHash);
    if (!sourceReceipt) {
      throw badRequest("SOURCE_TX_NOT_FOUND", "Custody deposit transaction was not found.");
    }
    const filter = contract.filters.TransferSingle(null, custodyAddress, request.recipientAddress);
    const events = await contract.queryFilter(filter, sourceReceipt.blockNumber, "latest");
    const tokenId = BigInt(request.tokenId);
    const amount = BigInt(request.amount);
    let event: ethers.EventLog | undefined;
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const candidate = events[index];
      if (!(candidate instanceof ethers.EventLog)) continue;
      if (BigInt(candidate.args.id) === tokenId && BigInt(candidate.args.value) === amount) {
        event = candidate;
        break;
      }
    }
    if (!event) return null;
    return {
      txHash: event.transactionHash,
      tokenId: request.tokenId,
      contractAddress: this.network.contractAddress,
      chain: this.network.chain,
      chainId: this.network.chainId,
    };
  }

  private async findExistingMint(
    contract: ethers.Contract,
    requestHash: string,
    request: MintRequest
  ): Promise<MintResult | null> {
    const filter = contract.filters.CardMinted(requestHash);
    const events = await contract.queryFilter(filter, this.network.deploymentBlock ?? 0, "latest");
    const event = events.at(-1);
    if (!event || !("args" in event) || !event.args) {
      return null;
    }
    return {
      txHash: event.transactionHash,
      tokenId: event.args.tokenId.toString(),
      contractAddress: this.network.contractAddress,
      tokenUri: request.tokenUri || event.args.tokenUri,
      chain: this.network.chain,
      chainId: this.network.chainId
    };
  }

  private nativeCurrency(): "POL" | "ETH" {
    return this.network.chain.startsWith("POLYGON") ? "POL" : "ETH";
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function badRequest(code: string, message: string): ApiError {
  return new ApiError(400, code, message);
}

function conflict(code: string, message: string): ApiError {
  return new ApiError(409, code, message);
}
