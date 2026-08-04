import "dotenv/config";
import { createApp } from "./app.js";
import { loadAppConfig } from "./config.js";
import { logger } from "./logger.js";

const config = loadAppConfig();
const app = createApp({ config });

app.listen(config.port, () => {
  logger.info({
    port: config.port,
    networkEnv: config.networkEnv,
    chain: config.network.chain,
    chainId: config.network.chainId,
    contractConfigured: Boolean(config.network.contractAddress)
  }, "NFT minter listening");
});
