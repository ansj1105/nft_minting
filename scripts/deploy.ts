import "dotenv/config";
import hre from "hardhat";
import { ethers } from "ethers";
import { loadAppConfig } from "../src/config.js";
import { normalizePrivateKey } from "../src/private-key.js";

async function main() {
  const config = loadAppConfig();
  if (!config.privateKey || config.privateKey.startsWith("replace-")) {
    throw new Error("MINTER_PRIVATE_KEY must be set to a real deployment key.");
  }

  const provider = new ethers.JsonRpcProvider(config.network.rpcUrl, config.network.chainId);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== config.network.chainId) {
    throw new Error(`RPC chainId ${network.chainId} does not match config ${config.network.chainId}.`);
  }

  const deployer = new ethers.Wallet(normalizePrivateKey(config.privateKey), provider);
  const artifact = await hre.artifacts.readArtifact("KorionCardItems");
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  const contract = await factory.deploy("", deployer.address) as ethers.Contract;
  const deploymentReceipt = await contract.deploymentTransaction()!.wait();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const minterRole = await contract.MINTER_ROLE();
  const deployerHasMinterRole = await contract.hasRole(minterRole, deployer.address);
  if (!deployerHasMinterRole) {
    throw new Error("Deployer does not have MINTER_ROLE after deployment.");
  }

  console.log(JSON.stringify({
    networkEnv: config.networkEnv,
    chain: config.network.chain,
    chainId: config.network.chainId,
    deployer: deployer.address,
    contractAddress: address,
    deploymentBlock: deploymentReceipt!.blockNumber,
    deployerHasMinterRole
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
