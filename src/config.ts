import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const networkConfigSchema = z.object({
  chain: z.string().min(1),
  chainId: z.number().int().positive(),
  rpcUrl: z.string().url(),
  contractAddress: z.string(),
  blockExplorerUrl: z.string().url().optional()
});

const networkMapSchema = z.record(networkConfigSchema);

export type NetworkConfig = z.infer<typeof networkConfigSchema>;

export interface AppConfig {
  port: number;
  apiKey: string;
  privateKey: string;
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

  return {
    port: Number(env.PORT || 8088),
    apiKey: env.MINTER_API_KEY || "",
    privateKey: env.MINTER_PRIVATE_KEY || "",
    networkEnv,
    network: {
      ...selected,
      chainId,
      rpcUrl: env.RPC_URL || selected.rpcUrl,
      contractAddress: env.CONTRACT_ADDRESS || selected.contractAddress
    }
  };
}
