export function normalizePrivateKey(privateKey: string): string {
  const value = privateKey.trim();
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(value)) {
    return value.startsWith("0x") ? value : `0x${value}`;
  }
  throw new Error("MINTER_PRIVATE_KEY must be a 32-byte hex string.");
}
