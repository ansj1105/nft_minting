import "dotenv/config";
import hre from "hardhat";
import { loadAppConfig } from "../src/config.js";

async function main() {
  const config = loadAppConfig();
  const [deployer] = await hre.ethers.getSigners();
  const factory = await hre.ethers.getContractFactory("KorionCardItems");
  const contract = await factory.deploy("", deployer.address);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log(JSON.stringify({
    networkEnv: config.networkEnv,
    chain: config.network.chain,
    chainId: config.network.chainId,
    deployer: deployer.address,
    contractAddress: address
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
