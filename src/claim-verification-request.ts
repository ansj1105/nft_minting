import { z } from "zod";

export const claimVerificationRequestSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  requestHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  tokenId: z.string().regex(/^\d+$/),
  minConfirmations: z.number().int().min(1).max(100).default(1),
});

export type ClaimVerificationRequest = z.infer<typeof claimVerificationRequestSchema>;
