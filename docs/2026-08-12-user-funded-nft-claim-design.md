# User-funded NFT withdrawal claim

## Product flow

1. The user selects Polygon or Ethereum and enters the NFT recipient address.
2. Connecting MetaMask may fill the recipient address, but the user may replace it.
3. KORION verifies card ownership and the existing email OTP before issuing a short-lived claim.
4. The connected MetaMask submits the claim transaction and pays the network gas directly.
5. The contract always sends the NFT to the entered recipient, even when a different wallet pays gas.
6. Before submission, the frontend compares the payer's native balance with the estimated transaction cost.
7. An insufficient balance opens a red warning showing required, available, and missing POL or ETH.
8. A confirmed on-chain claim completes the card withdrawal. The same claim cannot be used twice.

## Trust boundaries

- The browser never receives a minter private key.
- The minter signs an EIP-712 claim bound to chain, contract, recipient, token, amount, source, request hash, URI hash, and expiry.
- Anyone may relay the signed transaction, but the signature fixes the NFT recipient.
- The contract consumes the request hash before minting or releasing custody inventory.
- The backend verifies the claim event before recording completion.

## Compatibility

- Existing server-side `mintCard` and custody transfer APIs remain available during migration.
- User-funded claims require a newly deployed compatible contract on each testnet/mainnet.
- Polygon Amoy and Ethereum Sepolia must pass E2E before either mainnet profile is enabled.

## Failure handling

- Invalid recipient: reject before OTP creation.
- Insufficient payer gas: do not submit; show the missing native amount.
- Rejected MetaMask request: keep the authenticated claim available until expiry.
- Expired or replayed claim: reject on-chain and require a new claim.
- Submitted but not yet confirmed: keep the transfer pending and allow transaction re-check.
