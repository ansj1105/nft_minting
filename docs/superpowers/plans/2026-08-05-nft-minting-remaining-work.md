# NFT Minting Remaining Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Polygon NFT minter from committed scaffold to deployed, testnet-verified service connected to `coin_csms`.

**Architecture:** `nft_minting` remains a separate internal Node/TypeScript service that owns the private key boundary and exposes only `POST /mint` to `coin_csms`. The ERC-1155 contract is deployed on Polygon Amoy first, then the same config-map flow is reused for Polygon mainnet after testnet acceptance.

**Tech Stack:** Node 22, TypeScript, Express, ethers v6, Hardhat, OpenZeppelin ERC-1155, Docker, Polygon Amoy testnet, Polygon PoS mainnet.

## Global Constraints

- Keep real secrets out of git: no private keys, API keys, mnemonic phrases, `.env`, deploy secrets, or production URLs with credentials.
- Default network for verification is `NETWORK_ENV=polygon-amoy`.
- Network switching must remain config-map driven through `config/networks.json` plus runtime overrides: `NETWORK_ENV`, `RPC_URL`, `CHAIN_ID`, `CONTRACT_ADDRESS`.
- Mainnet work is blocked until Amoy deployment, Amoy mint test, `coin_csms` integration test, and production secret plan are complete.
- `coin_csms` NFT env values must stay unset in production until the real minter URL, API key, and contract address exist.
- Every task must run `npm run build`, `npm test`, `npm audit --omit=dev`, and `npm run lint:secrets` before commit.
- Commit and push only when the latest user message explicitly asks for `커밋`, `푸시`, or `배포`.

---

## Current Completed Baseline

- Repository created: `https://github.com/ansj1105/nft_minting.git`
- Local path: `/home/ubuntu/work/nft_minting`
- Remote branch: `origin/main`
- Last pushed commit: `4fe0204 feat: scaffold polygon nft minter`
- Implemented service files:
  - `src/app.ts`
  - `src/server.ts`
  - `src/config.ts`
  - `src/minter.ts`
  - `src/mint-request.ts`
  - `src/logger.ts`
  - `contracts/KorionCardItems.sol`
  - `scripts/deploy.ts`
  - `scripts/check-network.ts`
  - `config/networks.json`
  - `Dockerfile`
  - `.env.example`
  - `README.md`
- Verified locally before first push:
  - `npm run build`
  - `npm test`
  - `npm audit --omit=dev`
  - `npm run lint:secrets`
  - Amoy RPC check with placeholder secrets
- Local follow-up completed after this plan was written:
  - production `start` now runs `node dist/src/server.js`
  - `npm run deploy` now compiles contracts before deployment
  - deploy script uses the selected config-map RPC/chain instead of Hardhat's default network
  - deploy script verifies `MINTER_ROLE` after deployment
  - `check:network` verifies contract bytecode when `CONTRACT_ADDRESS` is configured
  - invalid private keys fail with a safe error that does not echo the configured value

---

## File Structure For Remaining Work

- Modify: `package.json`
  - Fix production start command if needed.
  - Add missing deployment/helper scripts only if they reduce manual error.
- Modify: `README.md`
  - Record exact Amoy deployment, minter env, `coin_csms` env, and mainnet promotion commands after each stage is verified.
- Modify: `.env.example`
  - Add only non-secret variable names needed by deployment.
- Modify: `config/networks.json`
  - Add deployed Amoy `contractAddress` after testnet contract deployment.
  - Add mainnet `contractAddress` only after mainnet contract deployment.
- Modify: `scripts/deploy.ts`
  - Keep deployment output machine-readable.
  - Add role/ownership post-deploy checks if missing.
- Modify: `scripts/check-network.ts`
  - Add contract code and chain checks if missing.
- Modify: `test/config.test.ts`
  - Cover config-map override behavior used by deploy.
- Modify: `test/mint.test.ts`
  - Cover API idempotency and contract/event behavior needed before live mint.
- Modify later in `/home/ubuntu/work/coin_csms`
  - Minter env wiring and deployment configuration only after `nft_minting` Amoy endpoint exists.

Observed `coin_csms` status after follow-up check:

- `CardGatchaNftMinterClient` already calls `POST <CARD_GATCHA_NFT_MINTER_URL>/mint`
- Admin route already exists at `POST /api/v2/admin/card-gatcha/cards/{cardId}/nft/mint`
- Existing env keys are `CARD_GATCHA_NFT_MINTER_URL`, `CARD_GATCHA_NFT_MINTER_API_KEY`, `CARD_GATCHA_NFT_CHAIN`, `CARD_GATCHA_NFT_CONTRACT_ADDRESS`, and `CARD_GATCHA_NFT_METADATA_BASE_URL`
- Remaining `coin_csms` work is runtime env configuration plus deployed E2E, not base client implementation

---

### Task 1: Runtime Start And Deployment Readiness

**Files:**
- Modify: `package.json`
- Modify: `Dockerfile`
- Modify: `README.md`

**Interfaces:**
- Consumes: compiled output from `tsconfig.json` with `rootDir` set to `.`
- Produces: production process command that starts the Express server consistently from Docker and non-Docker environments

- [x] **Step 1: Confirm compiled server output path**

Run:

```bash
cd /home/ubuntu/work/nft_minting
npm run build
ls dist/src/server.js
```

Expected: `dist/src/server.js` exists.

- [x] **Step 2: Fix `package.json` start command if it still points to the wrong path**

Expected content:

```json
"start": "node dist/src/server.js"
```

Do not change the Docker command if it already runs:

```dockerfile
CMD ["node", "dist/src/server.js"]
```

- [x] **Step 3: Verify production start reaches env validation**

Run with placeholders:

```bash
cd /home/ubuntu/work/nft_minting
NETWORK_ENV=polygon-amoy MINTER_API_KEY=replace-with-api-key MINTER_PRIVATE_KEY=replace-with-private-key npm run start
```

Expected: process starts or fails only because runtime contract/private-key values are placeholders. It must not fail with `Cannot find module dist/server.js`.

Observed after fix: it fails on placeholder `MINTER_PRIVATE_KEY` validation and no longer fails with `Cannot find module dist/server.js`.

- [x] **Step 4: Run local verification**

Run:

```bash
cd /home/ubuntu/work/nft_minting
npm run build
npm test
npm audit --omit=dev
npm run lint:secrets
```

Expected:

- build passes
- tests pass
- production audit reports 0 vulnerabilities
- secret scan shows only placeholder/env-key names, not real values

Observed after fix:

- `npm run build` passed
- `npm test` passed: 2 files, 7 tests
- `npm audit --omit=dev` passed with 0 vulnerabilities
- `npm run lint:secrets` reported only env names/placeholders, no real secret values

- [ ] **Step 5: Commit when publishing is explicitly requested**

```bash
git add package.json Dockerfile README.md
git commit -m "fix: align production start command"
git push
```

---

### Task 2: Amoy Wallet And Secret Preparation

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: `MINTER_PRIVATE_KEY`, `MINTER_API_KEY`, `NETWORK_ENV`, optional `RPC_URL`
- Produces: Amoy-ready runtime secret set without committing any secret value

- [ ] **Step 1: Create or select a dedicated Amoy minter wallet outside git**

Required operator data:

```text
MINTER_PRIVATE_KEY=<dedicated Amoy-only wallet private key>
MINTER_API_KEY=<random shared API key for coin_csms to call nft_minting>
NETWORK_ENV=polygon-amoy
```

The private key must not be reused from production or any user wallet.

- [ ] **Step 2: Fund the Amoy wallet with test POL**

Run:

```bash
cd /home/ubuntu/work/nft_minting
NETWORK_ENV=polygon-amoy MINTER_PRIVATE_KEY=<secret> MINTER_API_KEY=<secret> npm run check:network
```

Expected JSON:

```json
{
  "networkEnv": "polygon-amoy",
  "chain": "POLYGON_AMOY",
  "chainId": 80002,
  "rpcOk": true,
  "signerConfigured": true
}
```

- [ ] **Step 3: Record only redacted secret status**

Add README notes in this shape only:

```text
Amoy runtime secrets:
- MINTER_PRIVATE_KEY: SET in runtime secret store
- MINTER_API_KEY: SET in runtime secret store
- RPC_URL: using config/networks.json default or SET override
```

Never write the key, API token, or mnemonic into the repo.

- [ ] **Step 4: Run secret verification**

Run:

```bash
cd /home/ubuntu/work/nft_minting
npm run lint:secrets
```

Expected: no real secret values appear in output.

---

### Task 3: Deploy ERC-1155 Contract To Polygon Amoy

**Files:**
- Modify: `scripts/deploy.ts`
- Modify: `config/networks.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: Amoy wallet from Task 2
- Produces: deployed `KorionCardItems` contract address on chainId `80002`

- [ ] **Step 1: Deploy contract on Amoy**

Run:

```bash
cd /home/ubuntu/work/nft_minting
NETWORK_ENV=polygon-amoy MINTER_PRIVATE_KEY=<secret> MINTER_API_KEY=<secret> npm run deploy
```

Expected output:

```json
{
  "networkEnv": "polygon-amoy",
  "chain": "POLYGON_AMOY",
  "chainId": 80002,
  "deployer": "0x...",
  "contractAddress": "0x..."
}
```

- [ ] **Step 2: Verify contract code exists**

Run:

```bash
cd /home/ubuntu/work/nft_minting
NETWORK_ENV=polygon-amoy CONTRACT_ADDRESS=<amoy-contract> MINTER_PRIVATE_KEY=<secret> MINTER_API_KEY=<secret> npm run check:network
```

Expected: `contractConfigured` is `true` and the script confirms chain `80002`.

- [ ] **Step 3: Store Amoy contract address in config map**

Update `config/networks.json`:

```json
"polygon-amoy": {
  "chain": "POLYGON_AMOY",
  "chainId": 80002,
  "rpcUrl": "https://polygon-amoy.drpc.org",
  "contractAddress": "<amoy-contract>",
  "explorerUrl": "https://amoy.polygonscan.com"
}
```

- [ ] **Step 4: Document explorer URL**

Add to `README.md`:

```text
Amoy contract:
- chainId: 80002
- contractAddress: <amoy-contract>
- explorer: https://amoy.polygonscan.com/address/<amoy-contract>
```

- [ ] **Step 5: Run verification**

Run:

```bash
cd /home/ubuntu/work/nft_minting
npm run build
npm test
npm audit --omit=dev
npm run lint:secrets
```

- [ ] **Step 6: Commit when publishing is explicitly requested**

```bash
git add scripts/deploy.ts config/networks.json README.md
git commit -m "chore: configure amoy nft contract"
git push
```

---

### Task 4: Live Amoy Mint Test

**Files:**
- Modify: `test/mint.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: Amoy contract address from Task 3
- Produces: one successful testnet NFT mint transaction and idempotency proof

- [ ] **Step 1: Start service locally against Amoy**

Run:

```bash
cd /home/ubuntu/work/nft_minting
PORT=8088 NETWORK_ENV=polygon-amoy CONTRACT_ADDRESS=<amoy-contract> MINTER_PRIVATE_KEY=<secret> MINTER_API_KEY=<secret> npm run dev
```

Expected: Express server listens on port `8088`.

- [ ] **Step 2: Send first Amoy mint request**

Run from another shell:

```bash
curl -sS -X POST http://127.0.0.1:8088/mint \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: <secret>' \
  -H 'Idempotency-Key: card-gatcha-nft:amoy-smoke-1' \
  -d '{
    "idempotencyKey": "card-gatcha-nft:amoy-smoke-1",
    "chain": "POLYGON_AMOY",
    "contractAddress": "<amoy-contract>",
    "recipientAddress": "<operator-test-wallet>",
    "tokenUri": "https://metadata.korion.example/amoy/cards/amoy-smoke-1.json",
    "card": {
      "id": 1,
      "cardCode": "KOR-S01-COM-00001",
      "caseId": "CASE-AMOY-SMOKE-000001",
      "designId": "KOR-S01-COM-00001",
      "serialNo": 1,
      "seasonSerialNo": 1,
      "editionSize": 2500,
      "cardName": "Amoy Smoke Card",
      "rarityCode": "COM",
      "seasonCode": "S01",
      "imageUrl": "https://metadata.korion.example/amoy/cards/amoy-smoke-1.png"
    }
  }'
```

Expected response:

```json
{
  "txHash": "0x...",
  "tokenId": "...",
  "contractAddress": "<amoy-contract>",
  "tokenUri": "https://metadata.korion.example/amoy/cards/amoy-smoke-1.json",
  "chain": "POLYGON_AMOY",
  "chainId": 80002
}
```

- [ ] **Step 3: Repeat the same request for idempotency**

Run the same `curl` request again with the same `Idempotency-Key` and body.

Expected: response returns the original mint result or original transaction reference; it must not mint a second token for the same idempotency key.

- [ ] **Step 4: Verify on explorer**

Open:

```text
https://amoy.polygonscan.com/tx/<txHash>
https://amoy.polygonscan.com/address/<amoy-contract>
```

Expected:

- transaction status is success
- contract address matches `config/networks.json`
- token event exists for the test recipient

- [ ] **Step 5: Record only non-secret evidence**

Add to `README.md`:

```text
Amoy smoke mint:
- txHash: <txHash>
- tokenId: <tokenId>
- recipient: <operator-test-wallet>
- idempotencyKey: card-gatcha-nft:amoy-smoke-1
```

---

### Task 5: Deploy Minter Service To Server

**Files:**
- Modify: `Dockerfile`
- Modify: `.env.example`
- Create or modify: server deployment files outside git if the target host uses external Compose/systemd config
- Modify: `README.md`

**Interfaces:**
- Consumes: Amoy contract and secret set from Tasks 2-4
- Produces: internal HTTP endpoint reachable by `coin_csms`

- [ ] **Step 1: Select deployment target**

Confirm exact target before running deploy:

```text
host=<server hostname or IP>
runtime=<docker-compose|systemd|other>
internal_url=http://<host-or-service-name>:8088
```

Do not deploy to production public internet without network allowlist or internal routing.

- [ ] **Step 2: Configure runtime env on server**

Required runtime values:

```text
PORT=8088
NODE_ENV=production
NETWORK_ENV=polygon-amoy
MINTER_API_KEY=<secret>
MINTER_PRIVATE_KEY=<secret>
CONTRACT_ADDRESS=<amoy-contract>
```

Optional override:

```text
RPC_URL=<provider-url>
CHAIN_ID=80002
```

- [ ] **Step 3: Build deploy artifact**

Run:

```bash
cd /home/ubuntu/work/nft_minting
docker build -t korion/nft-minting:amoy .
```

Expected: image builds without TypeScript or dependency failures.

- [ ] **Step 4: Start service on target**

For Docker runtime, use equivalent settings:

```yaml
services:
  nft_minting:
    image: korion/nft-minting:amoy
    restart: unless-stopped
    ports:
      - "127.0.0.1:8088:8088"
    environment:
      PORT: "8088"
      NODE_ENV: production
      NETWORK_ENV: polygon-amoy
      CONTRACT_ADDRESS: "<amoy-contract>"
      MINTER_API_KEY: "${MINTER_API_KEY}"
      MINTER_PRIVATE_KEY: "${MINTER_PRIVATE_KEY}"
```

- [ ] **Step 5: Verify health without exposing secrets**

Run from the server:

```bash
curl -i http://127.0.0.1:8088/health
```

Expected: HTTP `200`.

- [ ] **Step 6: Verify protected API rejects missing API key**

Run:

```bash
curl -i -X POST http://127.0.0.1:8088/mint -H 'Content-Type: application/json' -d '{}'
```

Expected: HTTP `401`.

- [ ] **Step 7: Verify one server-side Amoy mint**

Repeat Task 4 mint request against the deployed internal URL.

Expected: HTTP `200`, successful Amoy transaction, no duplicate mint on retry.

---

### Task 6: Connect `coin_csms` To Amoy Minter

**Files:**
- Modify in `/home/ubuntu/work/coin_csms`: runtime env/deploy config for `CARD_GATCHA_NFT_MINTER_URL`
- Modify in `/home/ubuntu/work/coin_csms`: runtime env/deploy config for `CARD_GATCHA_NFT_MINTER_API_KEY`
- Modify in `/home/ubuntu/work/coin_csms`: runtime env/deploy config for NFT chain/contract values if already defined there
- Do not commit real env values

**Interfaces:**
- Consumes: deployed `nft_minting` internal URL from Task 5
- Produces: existing `coin_csms` admin NFT approval/mint endpoint can call real Amoy minter

- [ ] **Step 1: Pull latest `coin_csms` before editing**

Run:

```bash
git -C /home/ubuntu/work/coin_csms pull --rebase origin main
```

If the active branch is not `main`, stop and confirm the correct branch before editing.

- [ ] **Step 2: Locate existing NFT minter env usage**

Run:

```bash
cd /home/ubuntu/work/coin_csms
rg -n "CARD_GATCHA_NFT|NftMinter|nft.*mint|MINTER" .
```

Expected: find existing client/config references, especially `CARD_GATCHA_NFT_MINTER_URL` and API key handling.

- [ ] **Step 3: Set Amoy runtime env in deployment layer**

Configure only on server/runtime secret store:

```text
CARD_GATCHA_NFT_MINTER_URL=http://<internal-nft-minting-host>:8088
CARD_GATCHA_NFT_MINTER_API_KEY=<same secret as MINTER_API_KEY>
CARD_GATCHA_NFT_CHAIN=POLYGON_AMOY
CARD_GATCHA_NFT_CONTRACT_ADDRESS=<amoy-contract>
```

Do not write real values into tracked files.

- [ ] **Step 4: Run existing `coin_csms` tests/build**

Use the repo's existing verification command from its `package.json`, Gradle file, or README.

Expected: build and tests pass without requiring real secrets.

- [ ] **Step 5: Run admin mint integration test**

Call the existing admin endpoint:

```http
POST /api/v2/admin/card-gatcha/cards/{cardId}/nft/mint
```

Expected:

- `coin_csms` sends `POST /mint` to `nft_minting`
- `nft_minting` returns Amoy `txHash`
- card NFT status/job in `coin_csms` advances to minted
- duplicate admin retry does not create a duplicate on-chain mint

- [ ] **Step 6: Commit when publishing is explicitly requested**

Commit only tracked config/docs/code changes, not secrets:

```bash
git add <changed-safe-files>
git commit -m "chore: connect card gatcha nft minter"
git push
```

---

### Task 7: End-To-End Admin Flow Verification

**Files:**
- Modify: `README.md`
- Modify in `/home/ubuntu/work/coin_csms`: test/docs only if missing evidence capture is needed

**Interfaces:**
- Consumes: deployed Amoy minter and `coin_csms` env from Task 6
- Produces: operator-confirmed NFT mint path from admin API to Polygon Amoy

- [ ] **Step 1: Prepare a test card eligible for NFT mint**

Use an existing card-gatcha card in test/admin environment.

Required fields:

```text
cardId=<existing test card id>
recipientAddress=<operator Amoy wallet>
tokenUri=<reachable metadata JSON URL>
chain=POLYGON_AMOY
contractAddress=<amoy-contract>
```

- [ ] **Step 2: Trigger admin approval if required**

Call:

```http
POST /api/v2/admin/card-gatcha/cards/{cardId}/nft/approve
```

Expected: card becomes eligible for mint.

- [ ] **Step 3: Trigger admin mint**

Call:

```http
POST /api/v2/admin/card-gatcha/cards/{cardId}/nft/mint
```

Expected: response includes or persists Amoy transaction information.

- [ ] **Step 4: Verify database state**

Check only non-secret DB fields:

```text
cardId
nft_status
nft_chain
nft_contract_address
nft_token_id
nft_tx_hash
nft_minted_at
```

Expected:

- status is minted
- chain is `POLYGON_AMOY`
- contract address is `<amoy-contract>`
- tx hash exists
- token id exists

- [ ] **Step 5: Verify on Amoy explorer**

Open:

```text
https://amoy.polygonscan.com/tx/<txHash>
```

Expected: transaction status success and recipient matches requested wallet.

- [ ] **Step 6: Record evidence without secrets**

Add to `README.md` or an internal deployment note:

```text
Amoy E2E:
- coin_csms cardId: <cardId>
- txHash: <txHash>
- tokenId: <tokenId>
- contractAddress: <amoy-contract>
- verifiedAt: <YYYY-MM-DD HH:mm KST>
```

---

### Task 8: Mainnet Promotion Gate

**Files:**
- Modify: `config/networks.json`
- Modify: `README.md`
- Modify: production deployment config outside git
- Modify in `/home/ubuntu/work/coin_csms`: production runtime env only

**Interfaces:**
- Consumes: accepted Amoy E2E evidence from Task 7
- Produces: Polygon mainnet contract and minter service configuration

- [ ] **Step 1: Confirm promotion checklist**

All must be complete before mainnet:

```text
Amoy contract deployed
Amoy direct mint passed
Amoy idempotency retry passed
Amoy deployed service mint passed
coin_csms admin E2E passed
runtime secret storage selected
server network exposure reviewed
mainnet wallet funded with POL
metadata URL policy confirmed
```

- [ ] **Step 2: Prepare dedicated mainnet wallet**

Required:

```text
NETWORK_ENV=polygon-mainnet
MINTER_PRIVATE_KEY=<dedicated production minter key>
MINTER_API_KEY=<production shared API key>
RPC_URL=<production-grade Polygon RPC URL if default is not acceptable>
```

Do not reuse the Amoy private key.

- [ ] **Step 3: Deploy mainnet contract**

Run:

```bash
cd /home/ubuntu/work/nft_minting
NETWORK_ENV=polygon-mainnet MINTER_PRIVATE_KEY=<secret> MINTER_API_KEY=<secret> npm run deploy
```

Expected:

```json
{
  "networkEnv": "polygon-mainnet",
  "chain": "POLYGON",
  "chainId": 137,
  "deployer": "0x...",
  "contractAddress": "0x..."
}
```

- [ ] **Step 4: Add mainnet contract address to config map**

Update `config/networks.json`:

```json
"polygon-mainnet": {
  "chain": "POLYGON",
  "chainId": 137,
  "rpcUrl": "https://polygon.drpc.org",
  "contractAddress": "<mainnet-contract>",
  "explorerUrl": "https://polygonscan.com"
}
```

- [ ] **Step 5: Switch production deployment env**

Runtime only:

```text
NETWORK_ENV=polygon-mainnet
CONTRACT_ADDRESS=<mainnet-contract>
MINTER_PRIVATE_KEY=<production secret>
MINTER_API_KEY=<production secret>
```

- [ ] **Step 6: Switch `coin_csms` production env**

Runtime only:

```text
CARD_GATCHA_NFT_MINTER_URL=http://<production-internal-nft-minter>:8088
CARD_GATCHA_NFT_MINTER_API_KEY=<production shared API key>
CARD_GATCHA_NFT_CHAIN=POLYGON
CARD_GATCHA_NFT_CONTRACT_ADDRESS=<mainnet-contract>
```

- [ ] **Step 7: Run one controlled mainnet mint**

Use one operator-approved real card and recipient.

Expected:

- transaction succeeds on Polygon mainnet
- no duplicate mint on retry
- `coin_csms` persists mainnet tx hash and token id

- [ ] **Step 8: Commit when publishing is explicitly requested**

```bash
git add config/networks.json README.md
git commit -m "chore: configure polygon mainnet nft contract"
git push
```

---

### Task 9: Operational Guardrails

**Files:**
- Modify: `README.md`
- Create: deployment runbook file if the chosen server does not already have one

**Interfaces:**
- Consumes: deployed service and `coin_csms` integration
- Produces: repeatable operations checklist for restarts, rollback, and incident checks

- [ ] **Step 1: Add health and auth checks**

Document commands:

```bash
curl -i http://127.0.0.1:8088/health
curl -i -X POST http://127.0.0.1:8088/mint -H 'Content-Type: application/json' -d '{}'
```

Expected:

- `/health` returns `200`
- unauthenticated `/mint` returns `401`

- [ ] **Step 2: Add rollback rule**

Document:

```text
Rollback service image only if the contract address and idempotency behavior stay compatible.
Never roll back to a build that can remint an already used idempotency key.
```

- [ ] **Step 3: Add log fields to inspect**

Document these non-secret fields:

```text
requestId
idempotencyKey
chain
chainId
contractAddress
recipientAddress
tokenId
txHash
error code
```

- [ ] **Step 4: Add incident checks**

Document:

```text
RPC chainId mismatch
insufficient POL balance
contract address mismatch
API key missing or rejected
duplicate idempotency key
transaction reverted
coin_csms job stuck after tx success
coin_csms job marked failed before tx confirmation
```

- [ ] **Step 5: Final verification**

Run:

```bash
cd /home/ubuntu/work/nft_minting
npm run build
npm test
npm audit --omit=dev
npm run lint:secrets
```

Expected: all pass before reporting the system ready.

---

## Known Blockers

- No real Amoy minter private key has been provided.
- No Amoy test POL funding has been confirmed.
- No Amoy contract address exists yet.
- No deployment target has been selected for the minter service.
- No runtime secret store has been configured.
- `coin_csms` production NFT minter env must remain blocked until the deployed minter URL, API key, and contract address are real.
- Polygon mainnet deployment is blocked until Amoy E2E is accepted.

## Self-Review

- Spec coverage: separate repo, config-map network switching, testnet first, deployment, `coin_csms` integration, mainnet promotion, and operational checks are all covered.
- Placeholder scan: angle-bracket values represent operator-supplied runtime secrets, addresses, or hostnames and are intentionally not committed values.
- Type consistency: network names are `polygon-amoy` and `polygon-mainnet`; chain labels are `POLYGON_AMOY` and `POLYGON`; contract address and API key env names match existing service conventions.
