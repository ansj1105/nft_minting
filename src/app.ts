import express, { NextFunction, Request, Response } from "express";
import { AppConfig } from "./config.js";
import { logger } from "./logger.js";
import { mintRequestSchema } from "./mint-request.js";
import { ApiError, MintResult, NftMinter } from "./minter.js";
import { transferRequestSchema } from "./transfer-request.js";

interface AppOptions {
  config: AppConfig;
  minter?: NftMinter;
}

export function createApp(options: AppOptions) {
  const app = express();
  const inFlight = new Map<string, Promise<MintResult>>();
  const completed = new Map<string, MintResult>();
  const minter = options.minter || new NftMinter({
    network: options.config.network,
    privateKey: options.config.privateKey
  });

  app.use(express.json({ limit: "256kb" }));
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      logger.info({
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt
      }, "request completed");
    });
    next();
  });

  app.get("/health", async (_req, res, next) => {
    try {
      res.json({
        ok: true,
        networkEnv: options.config.networkEnv,
        chain: options.config.network.chain,
        chainId: options.config.network.chainId,
        contractAddress: options.config.network.contractAddress,
        custodyAddress: await minter.custodyAddress(),
        contractConfigured: minter.isConfigured()
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/mint", requireApiKey(options.config.apiKey), async (req, res, next) => {
    try {
      const body = mintRequestSchema.parse(req.body);
      const idempotencyHeader = req.header("Idempotency-Key");
      if (idempotencyHeader && idempotencyHeader !== body.idempotencyKey) {
        throw new ApiError(400, "IDEMPOTENCY_MISMATCH", "Idempotency-Key header must match body.idempotencyKey.");
      }

      const cached = completed.get(body.idempotencyKey);
      if (cached) {
        res.json(cached);
        return;
      }

      let task = inFlight.get(body.idempotencyKey);
      if (!task) {
        task = minter.mint(body).then((result) => {
          completed.set(body.idempotencyKey, result);
          return result;
        }).finally(() => {
          inFlight.delete(body.idempotencyKey);
        });
        inFlight.set(body.idempotencyKey, task);
      }

      res.json(await task);
    } catch (error) {
      next(error);
    }
  });

  app.post("/transfer", requireApiKey(options.config.apiKey), async (req, res, next) => {
    try {
      const body = transferRequestSchema.parse(req.body);
      const idempotencyHeader = req.header("Idempotency-Key");
      if (idempotencyHeader && idempotencyHeader !== body.idempotencyKey) {
        throw new ApiError(400, "IDEMPOTENCY_MISMATCH", "Idempotency-Key header must match body.idempotencyKey.");
      }
      const cacheKey = `transfer:${body.idempotencyKey}`;
      const cached = completed.get(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }
      let task = inFlight.get(cacheKey);
      if (!task) {
        task = minter.transfer(body).then((result) => {
          completed.set(cacheKey, result);
          return result;
        }).finally(() => inFlight.delete(cacheKey));
        inFlight.set(cacheKey, task);
      }
      res.json(await task);
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ApiError) {
      res.status(error.status).json({ code: error.code, message: error.message });
      return;
    }
    if (typeof error === "object" && error && "name" in error && error.name === "ZodError") {
      res.status(400).json({ code: "VALIDATION_ERROR", message: "Invalid NFT request." });
      return;
    }
    logger.error({ err: error }, "Unhandled request error");
    res.status(500).json({ code: "INTERNAL_ERROR", message: "Mint request failed." });
  });

  return app;
}

function requireApiKey(expected: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!expected) {
      next();
      return;
    }
    if (req.header("X-API-Key") !== expected) {
      res.status(401).json({ code: "UNAUTHORIZED", message: "Invalid API key." });
      return;
    }
    next();
  };
}
