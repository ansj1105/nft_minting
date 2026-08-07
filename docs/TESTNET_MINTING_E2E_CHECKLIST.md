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

- [x] Review and add the user withdrawal OpenAPI contract and focused backend repository tests.
- [x] Add focused `coin_csms` approval test for `WITHDRAWAL_REQUESTED`.
- [x] Add focused card-detail UI tests for address validation, submit lock, pending, issued token data, and explorer link.
- [x] Deploy the original withdrawal flow to `fox_coin`, `coin_csms`, and `fox_coin_frontend` through the established health-gated paths.
- [x] Verify deployed health endpoints and the card-detail route before touching card data.
- [x] Publish and deploy the 2026-08-08 follow-up fixes: canonical `nftEnabled`, persisted `nftChain`, chain-aware issued-state UI, public metadata guard, and Git-bundle minter workflow.

## Remaining: Card 6951 E2E

- [x] Confirm `cardId=6951` still belongs to `user_id=1808`, is `OWNED`, NFT-enabled, and unissued.
- [x] Upload one clearly marked test original through the existing administrator endpoint; keep automatic workers disabled.
- [x] Submit one user withdrawal request with a dedicated Amoy recipient address.
- [x] Verify the persisted recipient and `WITHDRAWAL_REQUESTED` state through the canonical user card response.
- [x] Approve through the existing administrator endpoint and verify `READY_TO_MINT`.
- [x] Mint once through the administrator endpoint and verify `ISSUED`, token ID, transaction hash, and exactly one Amoy `TransferSingle` event.
- [x] Retry the same administrator mint request and verify no additional on-chain event is created.
- [x] Verify the deployed card-detail screen shows the issued state, token ID, recipient, and completed action correctly.
- [x] Verify the issued card response and explorer link use persisted `nftChain=POLYGON_AMOY` and `amoy.polygonscan.com`.

## Remaining: Testnet Acceptance And Mainnet Gate

- [ ] Publish immutable card metadata and set `CARD_GATCHA_NFT_METADATA_BASE_URL`; do not use the smoke-mint placeholder URI for a real card.
- [ ] Set `CARD_GATCHA_NFT_ASSET_BASE_URL` to the public HTTPS origin used by metadata JSON; never write `s3://` as the NFT image URI.
- [x] Record E2E evidence: card `6951`, token ID `152313847548938606834917230208834693034`, transaction `0x1a266ab57da005ec598f690688334e7bcff1016cebd753b4ce83452aade5cd80`, and idempotent retry result.
- [x] Keep automated NFT workers disabled until the public metadata gate and follow-up deploy pass.
- [ ] Create a separate mainnet wallet and secrets only after Amoy acceptance; never reuse the Amoy private key.
- [ ] Deploy a separate mainnet contract, run controlled mainnet smoke mint, then review mainnet enablement.

## Ethereum

- [x] Add config-map profiles for `ethereum-sepolia` and `ethereum-mainnet`.
- [x] Check the dedicated testnet minter balance without printing its private key; confirmed `0 ETH`.
- [ ] Fund the dedicated testnet minter with Sepolia ETH.
- [ ] Deploy the ERC-1155 contract to Sepolia and record its deployment block.
- [ ] Run direct and `coin_csms` Sepolia mint/idempotency E2E.
- [ ] Keep Ethereum mainnet blocked until Sepolia and metadata acceptance pass.
