import { z } from "zod";

export const mintRequestSchema = z.object({
  idempotencyKey: z.string().min(8).max(160),
  chain: z.string().min(1).optional(),
  contractAddress: z.string().min(1).optional(),
  recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  tokenUri: z.string().min(1).max(700).optional(),
  card: z.object({
    id: z.union([z.number().int().positive(), z.string().min(1)]),
    cardCode: z.string().min(1),
    caseId: z.string().min(1).optional().nullable(),
    designId: z.string().min(1).optional().nullable(),
    serialNo: z.number().int().positive().optional().nullable(),
    seasonSerialNo: z.union([z.number().int().positive(), z.string().min(1)]).optional().nullable(),
    editionSize: z.number().int().positive().optional().nullable(),
    cardName: z.string().min(1).optional().nullable(),
    rarityCode: z.string().min(1).optional().nullable(),
    seasonCode: z.string().min(1).optional().nullable(),
    imageUrl: z.string().optional().nullable()
  })
});

export type MintRequest = z.infer<typeof mintRequestSchema>;

export function tokenIdFor(request: MintRequest): bigint {
  const source = request.card.caseId || `${request.card.cardCode}:${request.card.seasonSerialNo || request.card.serialNo || request.card.id}`;
  const hash = BigInt(`0x${Buffer.from(source).toString("hex")}`);
  return hash % ((1n << 128n) - 1n);
}
