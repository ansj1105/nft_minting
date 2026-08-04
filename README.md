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
