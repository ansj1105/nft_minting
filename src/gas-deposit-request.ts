import { z } from "zod";

export const gasDepositVerificationSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  minimumAmountWei: z.string().regex(/^[1-9][0-9]*$/),
  minConfirmations: z.number().int().min(1).max(64).default(1),
});

export type GasDepositVerificationRequest = z.infer<typeof gasDepositVerificationSchema>;
