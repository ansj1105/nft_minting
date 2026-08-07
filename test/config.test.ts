import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadAppConfig } from "../src/config.js";

describe("loadAppConfig", () => {
  it("selects polygon testnet by NETWORK_ENV and allows runtime overrides", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nft-config-"));
    const configPath = path.join(dir, "networks.json");
    fs.writeFileSync(configPath, JSON.stringify({
      "polygon-amoy": {
        chain: "POLYGON_AMOY",
        chainId: 80002,
        rpcUrl: "https://rpc-amoy.polygon.technology",
        contractAddress: "",
        deploymentBlock: undefined,
        blockExplorerUrl: "https://amoy.polygonscan.com"
      },
      "polygon-mainnet": {
        chain: "POLYGON",
        chainId: 137,
        rpcUrl: "https://polygon-rpc.com",
        contractAddress: "",
        blockExplorerUrl: "https://polygonscan.com"
      },
      "ethereum-sepolia": {
        chain: "ETHEREUM_SEPOLIA",
        chainId: 11155111,
        rpcUrl: "https://sepolia.drpc.org",
        contractAddress: "",
        blockExplorerUrl: "https://sepolia.etherscan.io"
      }
    }));

    const config = loadAppConfig({
      NETWORK_ENV: "polygon-amoy",
      NETWORK_CONFIG_PATH: configPath,
      CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000001",
      CONTRACT_DEPLOYMENT_BLOCK: "0",
      MINTER_PRIVATE_KEY: "replace-with-private-key",
      MINTER_API_KEY: "test-api-key"
    });

    expect(config.network.chain).toBe("POLYGON_AMOY");
    expect(config.network.chainId).toBe(80002);
    expect(config.network.contractAddress).toBe("0x0000000000000000000000000000000000000001");
    expect(config.network.deploymentBlock).toBe(0);
  });

  it("selects Ethereum Sepolia from the same config map", () => {
    const config = loadAppConfig({
      NETWORK_ENV: "ethereum-sepolia",
      NETWORK_CONFIG_PATH: path.resolve("config/networks.json"),
      MINTER_PRIVATE_KEY: "replace-with-private-key",
      MINTER_API_KEY: "test-api-key"
    });

    expect(config.network.chain).toBe("ETHEREUM_SEPOLIA");
    expect(config.network.chainId).toBe(11155111);
    expect(config.network.contractAddress).toBe("");
  });
});
