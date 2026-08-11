# NFT Minting Repo Agent Memo

## Repository Scope

- Repo: `nft_minting`
- Remote: `https://github.com/ansj1105/nft_minting.git`
- Branch: `main`
- Role: isolated KORION card-gatcha NFT minting service.
- Boundary: `coin_csms` owns admin orchestration and calls `POST /mint`; this repo owns Polygon transaction submission, ERC-1155 contract config, hot-wallet/private-key handling, and idempotency.

## Network Policy

- Use Polygon Amoy first: `NETWORK_ENV=polygon-amoy`.
- Use Polygon mainnet only after Amoy contract deploy, direct mint, deployed-service mint, and `coin_csms` admin E2E all pass: `NETWORK_ENV=polygon-mainnet`.
- Keep network switching config-map based through `config/networks.json`.
- Runtime may override config with `RPC_URL`, `CHAIN_ID`, and `CONTRACT_ADDRESS`.
- Do not hardcode chain-specific request logic in handlers or services.

## Secret Hygiene

- Never commit, print, or document real values for:
  - `MINTER_PRIVATE_KEY`
  - `MINTER_API_KEY`
  - mnemonic or seed phrases
  - RPC provider secrets
  - deployed `.env` files
- `.env.example` may contain placeholder names only.
- Use runtime secret storage for server deployment.
- If a real wallet key or API key is committed, treat it as compromised and rotate it before continuing.

## Verification

Before reporting the repo ready or committing changes, run:

```bash
npm run build
npm test
npm audit --omit=dev
npm run lint:secrets
```

For live network checks, use redacted runtime env and start on Amoy:

```bash
NETWORK_ENV=polygon-amoy MINTER_PRIVATE_KEY=<runtime-secret> MINTER_API_KEY=<runtime-secret> npm run check:network
```

Do not paste real env values into chat or docs.

## Runtime Notes

- Production start should execute `dist/src/server.js` unless `tsconfig.json` output layout changes.
- Docker deploys should keep the service internal or loopback-bound.
- `POST /mint` must require `X-API-Key` and idempotency.
- Browser frontend code must not call this service directly.
- The Amoy minter is deployed as an internal `coin-shared` Docker service. `coin_csms` may call it only with its shared API key; do not publish a host port or permit browser access.
- Automatic card-gatcha NFT workers stay disabled until a controlled admin E2E mint of an explicitly chosen disposable test card passes.
- The current Amoy contract is `0xd6BC9dF3AE8B553Ff692203f4b9359C82d390022`. Mainnet needs a separately funded wallet, contract deployment, and a fresh acceptance gate.
- Deployment authority: use the reviewed GitHub-hosted Actions workflow with exact-repository/ref OIDC, the `korion/prod/foxya/nft-minting` ECR repository, and the instance-scoped SSM document. Preserve host `.env`, deploy the exact immutable digest through candidate-health-and-swap, and promote `current`/`previous` only after success. Verify `/health` reports `polygon-amoy`, chain ID `80002`, and `contractConfigured=true` without printing runtime environment values. Do not give the minter host GitHub credentials, long-lived AWS credentials, or copied private keys.

## Current Work Plan

- Remaining implementation/deployment plan lives at:
  `docs/superpowers/plans/2026-08-05-nft-minting-remaining-work.md`
