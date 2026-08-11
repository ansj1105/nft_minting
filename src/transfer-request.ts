import { z } from "zod";

export const transferRequestSchema = z.object({
  idempotencyKey: z.string().min(8).max(160),
  chain: z.string().min(1).optional(),
  contractAddress: z.string().min(1).optional(),
  recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  custodyAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  tokenId: z.string().regex(/^\d+$/),
  amount: z.string().regex(/^[1-9]\d*$/).default("1"),
  sourceTxHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

export type TransferRequest = z.infer<typeof transferRequestSchema>;
