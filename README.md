# KORION Card NFT Minting Service

Internal minter service for card-gatcha NFT issuance.

`coin_csms` calls `POST /mint`; this service owns the chain private key boundary and sends the Polygon transaction.

## Network Switching

Set `NETWORK_ENV`:

- `polygon-amoy`: Polygon Amoy testnet
- `polygon-mainnet`: Polygon PoS mainnet

Defaults live in `config/networks.json`. Runtime env values `RPC_URL`, `CHAIN_ID`, and `CONTRACT_ADDRESS` override the selected config map entry.

## Required Env

```bash
cp .env.example .env
```

Fill only local runtime values in `.env`; do not commit real keys.

Required runtime values:

```bash
PORT=8088
NETWORK_ENV=polygon-amoy
MINTER_API_KEY=replace-with-shared-api-key
MINTER_PRIVATE_KEY=replace-with-private-key
CONTRACT_ADDRESS=
```

Use `polygon-amoy` until the testnet contract, direct mint, deployed-service mint, and `coin_csms` admin E2E all pass. Switch to `polygon-mainnet` only after that gate is accepted.

## Deployment Readiness

Local verification:

```bash
npm run build
npm test
npm audit --omit=dev
npm run lint:secrets
```

Network verification starts on Amoy:

```bash
NETWORK_ENV=polygon-amoy MINTER_PRIVATE_KEY=<runtime-secret> MINTER_API_KEY=<runtime-secret> npm run check:network
```

Deploy the ERC-1155 contract after the Amoy minter wallet is funded:

```bash
NETWORK_ENV=polygon-amoy MINTER_PRIVATE_KEY=<runtime-secret> MINTER_API_KEY=<runtime-secret> npm run deploy
```

After deploy, set `CONTRACT_ADDRESS` in runtime config or `config/networks.json`, then run:

```bash
NETWORK_ENV=polygon-amoy CONTRACT_ADDRESS=<amoy-contract> MINTER_PRIVATE_KEY=<runtime-secret> MINTER_API_KEY=<runtime-secret> npm run check:network
```

The minter service should stay internal or loopback-bound. Browser frontend code must not call it directly; `coin_csms` calls `POST /mint` with `X-API-Key` and idempotency.

## API

```http
POST /mint
X-API-Key: <MINTER_API_KEY>
Idempotency-Key: card-gatcha-nft:123
Content-Type: application/json
```

```json
{
  "idempotencyKey": "card-gatcha-nft:123",
  "chain": "POLYGON_AMOY",
  "contractAddress": "0x...",
  "recipientAddress": "0x...",
  "tokenUri": "https://metadata.example/cards/KOR-S01-COM-00001-000001.json",
  "card": {
    "id": 123,
    "cardCode": "KOR-S01-COM-00001",
    "caseId": "CASE-KOR-S01-COM-00001-000001",
    "designId": "KOR-S01-COM-00001",
    "serialNo": 1,
    "seasonSerialNo": 1,
    "editionSize": 2500,
    "cardName": "Signal Kitten",
    "rarityCode": "COM",
    "seasonCode": "S01",
    "imageUrl": "https://..."
  }
}
```

Response:

```json
{
  "txHash": "0x...",
  "tokenId": "123456",
  "contractAddress": "0x...",
  "tokenUri": "https://..."
}
```
