# Amoy Minting E2E Checklist

## Completed

- [x] Dedicated Amoy minter wallet and runtime API key created outside git.
- [x] Amoy wallet funded with test POL.
- [x] ERC-1155 deployed: `0xd6BC9dF3AE8B553Ff692203f4b9359C82d390022`.
- [x] Direct smoke mint verified with one on-chain event.
- [x] `nft_minting` deployed internally on the `coin-shared` Docker network.
- [x] `coin_csms` can reach the minter health endpoint; automatic NFT workers are disabled.
- [x] NFT minter GitHub Actions deployment workflow passed.
- [x] User withdrawal request code pushed: `fox_coin/develop` `75d20ea8`.
- [x] Admin approval state update pushed: `coin_csms/main` `b6a2784`.
- [x] Card-detail withdrawal UI pushed: `fox_coin_frontend/develop` `57af7d14`.

## Remaining: Safe Deployment

- [ ] Review and add the user withdrawal OpenAPI contract and focused backend tests.
- [x] Add focused `coin_csms` approval test for `WITHDRAWAL_REQUESTED`.
- [ ] Add focused card-detail UI tests for address validation, submit lock, pending, and issued state.
- [ ] Deploy `fox_coin`, `coin_csms`, and `fox_coin_frontend` through a rolling/candidate health-check path. Do not use a command that replaces both `foxya-api` replicas at once.
- [ ] Verify deployed health endpoints and the authenticated card-detail route before touching card data.

## Remaining: Card 6951 E2E

- [x] Confirm `cardId=6951` still belongs to `user_id=1808`, is `OWNED`, NFT-enabled, and unissued.
- [ ] Upload one clearly marked test original through the existing administrator endpoint; keep automatic workers disabled.
- [ ] Submit one user withdrawal request with a dedicated Amoy recipient address.
- [ ] Verify the persisted recipient and `WITHDRAWAL_REQUESTED` state through the canonical user card response.
- [ ] Approve through the existing administrator endpoint and verify `READY_TO_MINT`.
- [ ] Mint once through the administrator endpoint and verify `ISSUED`, token ID, transaction hash, and exactly one Amoy `TransferSingle` event.
- [ ] Retry the same administrator mint request and verify no additional on-chain event is created.
- [ ] Verify the deployed card-detail screen shows the pending and issued states correctly.

## Remaining: Testnet Acceptance And Mainnet Gate

- [ ] Publish immutable card metadata and set `CARD_GATCHA_NFT_METADATA_BASE_URL`; do not use the smoke-mint placeholder URI for a real card.
- [ ] Record E2E evidence: card ID, request time, token ID, transaction hash, and idempotency retry result. Do not record secrets.
- [ ] Keep automated NFT workers disabled until the controlled E2E is accepted.
- [ ] Create a separate mainnet wallet and secrets only after Amoy acceptance; never reuse the Amoy private key.
- [ ] Deploy a separate mainnet contract, run controlled mainnet smoke mint, then review mainnet enablement.
