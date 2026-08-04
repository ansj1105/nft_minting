import "dotenv/config";
import "@nomicfoundation/hardhat-ethers";

const accounts = process.env.MINTER_PRIVATE_KEY && !process.env.MINTER_PRIVATE_KEY.startsWith("replace-")
  ? [process.env.MINTER_PRIVATE_KEY]
  : [];

const config = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 31337
    },
    "polygon-amoy": {
      url: process.env.RPC_URL || "https://polygon-amoy.drpc.org",
      chainId: 80002,
      accounts
    },
    "polygon-mainnet": {
      url: process.env.RPC_URL || "https://polygon.drpc.org",
      chainId: 137,
      accounts
    }
  }
};

export default config;
