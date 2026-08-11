import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ethers } from "ethers";
import { normalizePrivateKey } from "./private-key.js";

const networkConfigSchema = z.object({
  chain: z.string().min(1),
  chainId: z.number().int().positive(),
  rpcUrl: z.string().url(),
  contractAddress: z.string(),
  deploymentBlock: z.number().int().nonnegative().optional(),
  blockExplorerUrl: z.string().url().optional()
});

const networkMapSchema = z.record(networkConfigSchema);

export type NetworkConfig = z.infer<typeof networkConfigSchema>;

export interface AppConfig {
  port: number;
  apiKey: string;
  privateKey: string;
  custodyAddress?: string;
  networkEnv: string;
  network: NetworkConfig;
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const networkEnv = env.NETWORK_ENV || "polygon-amoy";
  const configPath = path.resolve(env.NETWORK_CONFIG_PATH || "config/networks.json");
  const networkMap = networkMapSchema.parse(JSON.parse(fs.readFileSync(configPath, "utf8")));
  const selected = networkMap[networkEnv];

  if (!selected) {
    throw new Error(`Unknown NETWORK_ENV '${networkEnv}'.`);
  }

  const chainId = env.CHAIN_ID ? Number(env.CHAIN_ID) : selected.chainId;
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error("CHAIN_ID must be a positive integer.");
  }
  const deploymentBlock = env.CONTRACT_DEPLOYMENT_BLOCK
    ? Number(env.CONTRACT_DEPLOYMENT_BLOCK)
    : selected.deploymentBlock;
  if (deploymentBlock !== undefined && (!Number.isInteger(deploymentBlock) || deploymentBlock < 0)) {
    throw new Error("CONTRACT_DEPLOYMENT_BLOCK must be a non-negative integer.");
  }
  const contractAddress = env.CONTRACT_ADDRESS || selected.contractAddress;
  if (contractAddress && deploymentBlock === undefined) {
    throw new Error("CONTRACT_DEPLOYMENT_BLOCK is required when CONTRACT_ADDRESS is configured.");
  }

  const privateKey = env.MINTER_PRIVATE_KEY || "";
  const custodyAddress = env.CUSTODY_ADDRESS?.trim();
  if (privateKey && !privateKey.startsWith("replace-")) {
    if (!custodyAddress || !/^0x[a-fA-F0-9]{40}$/.test(custodyAddress)) {
      throw new Error("CUSTODY_ADDRESS is required when MINTER_PRIVATE_KEY is configured.");
    }
    if (ethers.computeAddress(normalizePrivateKey(privateKey)).toLowerCase() !== custodyAddress.toLowerCase()) {
      throw new Error("CUSTODY_ADDRESS does not match the configured NFT signer.");
    }
  }

  return {
    port: Number(env.PORT || 8088),
    apiKey: env.MINTER_API_KEY || "",
    privateKey,
    custodyAddress,
    networkEnv,
    network: {
      ...selected,
      chainId,
      rpcUrl: env.RPC_URL || selected.rpcUrl,
      contractAddress,
      deploymentBlock
    }
  };
}
