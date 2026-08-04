import "dotenv/config";
import { ethers } from "ethers";
import { loadAppConfig } from "../src/config.js";

async function main() {
  const config = loadAppConfig();
  const provider = new ethers.JsonRpcProvider(config.network.rpcUrl, config.network.chainId);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== config.network.chainId) {
    throw new Error(`RPC chainId ${network.chainId} does not match config ${config.network.chainId}.`);
  }

  const result: Record<string, unknown> = {
    networkEnv: config.networkEnv,
    chain: config.network.chain,
    chainId: Number(network.chainId),
    rpcOk: true,
    contractConfigured: Boolean(config.network.contractAddress),
    signerConfigured: Boolean(config.privateKey && !config.privateKey.startsWith("replace-"))
  };

  if (result.signerConfigured) {
    result.signerAddress = new ethers.Wallet(config.privateKey).address;
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
