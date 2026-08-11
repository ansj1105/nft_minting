import { z } from "zod";
import { mintRequestSchema } from "./mint-request.js";

export const claimRequestSchema = mintRequestSchema.extend({
  sourceAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
  tokenId: z.string().regex(/^\d+$/).optional(),
}).superRefine((request, context) => {
  if (request.sourceAddress && !request.tokenId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["tokenId"],
      message: "tokenId is required for a custody claim.",
    });
  }
});

export type ClaimRequest = z.infer<typeof claimRequestSchema>;
