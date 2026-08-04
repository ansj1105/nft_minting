import "dotenv/config";
import { ethers } from "ethers";
import { loadAppConfig } from "../src/config.js";
import { normalizePrivateKey } from "../src/private-key.js";

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
    contractCodeFound: false,
    signerConfigured: Boolean(config.privateKey && !config.privateKey.startsWith("replace-"))
  };

  if (config.network.contractAddress) {
    if (!ethers.isAddress(config.network.contractAddress)) {
      throw new Error("CONTRACT_ADDRESS must be a valid EVM address.");
    }
    const code = await provider.getCode(config.network.contractAddress);
    result.contractCodeFound = code !== "0x";
    if (!result.contractCodeFound) {
      throw new Error(`No contract code found at ${config.network.contractAddress} on chain ${config.network.chainId}.`);
    }
  }

  if (result.signerConfigured) {
    result.signerAddress = new ethers.Wallet(normalizePrivateKey(config.privateKey)).address;
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
