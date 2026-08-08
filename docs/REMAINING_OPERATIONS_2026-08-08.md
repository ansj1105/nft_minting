# NFT Minting Remaining Operations

기준일: 2026-08-08 KST

## 현재 완료 상태

- Polygon Amoy ERC-1155 계약 배포 완료
- 카드 `6951` 실제 민팅과 중복 방지 확인 완료
- `coin_csms -> nft_minting -> Polygon Amoy` 연결 완료
- 카드 `6951` Token ID: `152313847548938606834917230208834693034`
- 카드 `6951` transaction: `0x1a266ab57da005ec598f690688334e7bcff1016cebd753b4ce83452aade5cd80`
- 자동 민팅 워커는 운영에서 활성 상태이며 S3 import worker는 비활성 상태
- Ethereum Sepolia minter 공개 주소: `0x5A93682B7028f50F302db70c37a99eC6B3bd20e2`
- Sepolia ERC-1155: `0xd6BC9dF3AE8B553Ff692203f4b9359C82d390022` (deployment block `11444619`)
- Sepolia 잔액: `0.04808858635804417 ETH` (E2E 후)

## 1. 현재 로컬 변경 배포

- [x] `fox_coin`: `nftEnabled`를 사용자 카드 응답에 포함하고 출금 UPDATE에서 디자인 NFT 허용 여부 확인 (`62680c25`)
- [x] `card_cloud_flyway`: V40으로 민팅 체인(`nft_chain`) 저장 컬럼과 허용값 제약 추가 (`0d4f097`)
- [x] `fox_coin_frontend`: 발급 완료 Token ID, 수신 주소, 민팅 체인별 explorer 링크 표시 (`bdb32163`)
- [x] `coin_csms`: 공개 HTTPS 메타데이터·이미지 URL이 없으면 자동 민팅 차단 (`7a6bd6c`)
- [x] `nft_minting`: GitHub-hosted 검증 후 deploy-role Git bundle 전달, candidate health gate, swap rollback 적용 (`d520928`)
- [x] Flyway -> CSMS -> Foxya -> frontend -> minter 순서로 운영 반영
- [x] Foxya rolling health, CSMS health, minter health, 카드 상세 Playwright 검증

배포 검증 결과:

- Foxya app/app2 모두 Docker health `healthy`, 외부 `https://api.korion.io.kr/health` 응답 `UP`
- CSMS와 minter health 통과, minter runtime은 `polygon-amoy`, chain ID `80002`
- 카드 `6951` 화면에서 발급 완료, Token ID, Amoy explorer 링크 표시 확인
- Playwright: route `200`, failed request `0`, fatal console error `0`

## 2. 비공개 S3에 CloudFront 연결

현재 원본 객체는 EC2 IAM으로 읽을 수 있지만 공개 S3 HTTPS 요청은 `403`이다. S3 public access를 해제하지 말고 CloudFront Origin Access Control을 사용한다.

- [x] AWS 관리자 권한 계정으로 기존 NFT 원본 bucket을 CloudFront origin으로 선택
- [x] 새 Origin Access Control 생성 후 해당 origin에 연결
- [x] bucket policy에 CloudFront distribution의 `s3:GetObject` 허용
- [x] NFT 메타데이터와 원본 prefix를 CloudFront로 제공
- [x] viewer method GET/HEAD 및 HTTPS 배포 확인
- [x] 메타데이터 JSON과 원본 이미지 URL이 인증 없이 HTTP `200`인지 확인
- [x] 공개 URL에 bucket 이름이나 AWS 자격증명 query string을 사용하지 않음

CloudFront domain: `https://dkdkgo83wk16z.cloudfront.net`

Runtime env 형식:

```text
CARD_GATCHA_NFT_S3_BUCKET=<existing-private-bucket>
CARD_GATCHA_NFT_S3_REGION=us-east-1
CARD_GATCHA_NFT_METADATA_BASE_URL=https://<cloudfront-domain>/metadata
CARD_GATCHA_NFT_ASSET_BASE_URL=https://<cloudfront-domain>
CARD_GATCHA_NFT_WORKER_ENABLED=false
CARD_GATCHA_NFT_S3_IMPORT_WORKER_ENABLED=false
```

## 3. 메타데이터 포함 Amoy 승인 테스트

카드 `6951`은 메타데이터 URI 없이 발급된 smoke NFT다. 배포된 계약에는 이미 발급된 Token URI 수정 함수가 없으므로 `6951`을 운영 메타데이터 검증 카드로 재사용하지 않는다.

- [x] 미발급 테스트 카드 `3896`을 선택하고 원본을 할당
- [x] 테스트 계정의 출금 요청 및 관리자 승인
- [x] 워커 비활성 상태에서 관리자 처리로 메타데이터 생성 검증
- [x] 메타데이터 JSON `name`, `image`, `properties.originalSha256` 확인
- [x] `image`가 `https://`이고 HTTP `200`인지 확인
- [x] 새 idempotency key로 Amoy 민팅 (`0x37c5498b43be530da0f58b0c939f661e1fc66e08774e668d2adbe0102ea23b9d`)
- [x] 계약 `uri(tokenId)`가 메타데이터 URL을 반환하는지 확인
- [x] 카드 응답의 `nftChain=POLYGON_AMOY`와 Polygon Amoy explorer 링크 확인
- [x] 중복 요청의 `CardMinted` 이벤트가 1건으로 유지되는지 확인

## 4. 자동 워커 활성화

- [x] 3번 테스트 통과 후 `CARD_GATCHA_NFT_WORKER_ENABLED=true`
- [x] S3 자동 import는 현재 불필요하므로 `CARD_GATCHA_NFT_S3_IMPORT_WORKER_ENABLED=false` 유지
- [x] CSMS candidate health 확인 후 managed container 교체
- [x] 처리할 작업이 없는 상태에서 worker 오류 로그가 발생하지 않는지 확인
- [x] 테스트 카드 `3897`로 `READY_TO_MINT -> MINT_REQUESTED -> ISSUED` 자동 전이 확인
- [x] 같은 request ID 재요청이 기존 transaction과 token ID를 반환하고 `CardMinted` 이벤트가 1건인지 확인

Automatic Amoy E2E evidence:

- Card: `3897`, asset job: `4472`
- Token ID: `152313847548938606853003686312354537636`
- Transaction: `0xe8649751bfd67afb57a66e62850cefb6be80e584eb45ff1ba23ec146093c2734`
- Receipt status `1`, `CardMinted` event `1`, public metadata/image HTTP `200`
- On-chain `uri(tokenId)` matched the CloudFront metadata URL
- Deployed card screen showed the Amoy explorer link and token ID with no failed requests

## 5. Ethereum Sepolia

- [x] faucet에서 `0x5A93682B7028f50F302db70c37a99eC6B3bd20e2`에 Sepolia ETH 충전 (`0.05 ETH`)
- [x] 잔액 확인 후 `NETWORK_ENV=ethereum-sepolia`로 network check
- [x] 동일 ERC-1155 코드를 Sepolia에 배포 (`0xd6BC9dF3AE8B553Ff692203f4b9359C82d390022`)
- [x] `config/networks.json`에 Sepolia contract address와 deployment block (`11444619`) 기록
- [x] 직접 mint와 동일 idempotency retry 확인 (`0x32ddbedcb01055a46808bdfff10b24d656828d298b6589247c9f82935e67a310`, event 1건)
- [x] `coin_csms` candidate runtime만 Sepolia로 전환하여 관리자 E2E 확인 (test card `3902`)
- [x] 카드 응답의 `nftChain=ETHEREUM_SEPOLIA`와 Sepolia Etherscan 링크 확인
- [x] 검증 후 임시 candidate를 제거하고 운영 runtime은 Polygon Amoy로 유지

Sepolia E2E evidence:

- Card: `3902`, asset job: `4471`
- Token ID: `152313847548938606871810718356253728933`
- Transaction: `0xf57de983b43dd4499508f1a124a7f893bb07c746ffc141e77b41c14a3afbd5d7`
- Receipt status `1`, `CardMinted` event `1`, recipient balance `1`
- Public metadata and image HTTP `200`; on-chain `uri(tokenId)` matched
- Repeated admin mint returned the same transaction with `alreadyIssued=true`
- Asset job `4471` was reconciled to `MINTED`; its S3 original is tagged `archive=true` and `asset_status=minted`.

## 6. Mainnet Gate

- [ ] Polygon mainnet과 Ethereum mainnet에 각각 전용 hot wallet 생성
- [ ] 테스트넷 private key를 mainnet에서 재사용하지 않음
- [ ] CloudFront metadata acceptance, Amoy 자동 E2E, Sepolia E2E가 모두 완료됐는지 확인
- [ ] 소액 gas만 충전하고 별도 mainnet ERC-1155 계약 배포
- [ ] controlled smoke mint 후 explorer, `uri(tokenId)`, 중복 방지 확인
- [ ] 최종 승인 전까지 mainnet worker는 비활성 유지

## 확인된 외부 차단 사항

- Sepolia minter balance와 계약 배포 차단은 해소됨 (`0.05 ETH`, deployment block `11444619`)
- EC2 role에 `s3:DeleteObject`를 추가하고 카드 `3896`의 미참조 원본 1개를 삭제 완료
- 테스트넷 acceptance가 모두 통과했으며 다음 단계는 별도 mainnet wallet과 contract를 준비하는 mainnet gate다.
