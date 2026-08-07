# NFT Minting Remaining Operations

기준일: 2026-08-08 KST

## 현재 완료 상태

- Polygon Amoy ERC-1155 계약 배포 완료
- 카드 `6951` 실제 민팅과 중복 방지 확인 완료
- `coin_csms -> nft_minting -> Polygon Amoy` 연결 완료
- 카드 `6951` Token ID: `152313847548938606834917230208834693034`
- 카드 `6951` transaction: `0x1a266ab57da005ec598f690688334e7bcff1016cebd753b4ce83452aade5cd80`
- 자동 민팅 워커와 S3 import worker는 운영에서 비활성 상태
- Ethereum Sepolia minter 공개 주소: `0x5A93682B7028f50F302db70c37a99eC6B3bd20e2`
- Sepolia 잔액: `0 ETH`

## 1. 현재 로컬 변경 배포

- [ ] `fox_coin`: `nftEnabled`를 사용자 카드 응답에 포함하고 출금 UPDATE에서 디자인 NFT 허용 여부 확인
- [ ] `card_cloud_flyway`: V40으로 민팅 체인(`nft_chain`) 저장 컬럼과 허용값 제약 추가
- [ ] `fox_coin_frontend`: 발급 완료 Token ID, 수신 주소, 민팅 체인별 explorer 링크 표시
- [ ] `coin_csms`: 공개 HTTPS 메타데이터·이미지 URL이 없으면 자동 민팅 차단
- [ ] `nft_minting`: GitHub-hosted 검증 후 deploy-role Git bundle 전달, candidate health gate, swap rollback 적용
- [ ] 최신 사용자 메시지에서 커밋·푸시·배포 권한을 받은 뒤 Flyway -> CSMS -> Foxya -> frontend -> minter 순서로 게시
- [ ] 배포 후 Foxya rolling health, CSMS health, minter health, 카드 상세 Playwright 검증

## 2. 비공개 S3에 CloudFront 연결

현재 원본 객체는 EC2 IAM으로 읽을 수 있지만 공개 S3 HTTPS 요청은 `403`이다. S3 public access를 해제하지 말고 CloudFront Origin Access Control을 사용한다.

- [ ] AWS 관리자 권한 계정으로 기존 NFT 원본 bucket을 CloudFront origin으로 선택
- [ ] 새 Origin Access Control 생성 후 해당 origin에 연결
- [ ] bucket policy에는 CloudFront distribution ARN의 `s3:GetObject`만 허용
- [ ] 허용 prefix는 최소 `metadata/cards/*`와 실제 NFT 원본 prefix로 제한
- [ ] viewer protocol policy는 HTTPS only, 허용 method는 GET/HEAD로 제한
- [ ] 메타데이터 JSON과 원본 이미지 URL이 인증 없이 HTTP `200`인지 확인
- [ ] 공개 URL에서 bucket 이름이나 AWS 자격증명 query string을 사용하지 않음

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

- [ ] 미발급 테스트 카드 1장을 선택하고 원본을 할당
- [ ] 사용자 출금 요청 후 관리자 승인
- [ ] 워커는 계속 비활성 상태에서 관리자 처리로 메타데이터 JSON 생성 경로 검증
- [ ] 메타데이터 URL의 JSON `name`, `image`, `properties.originalSha256` 확인
- [ ] `image`가 `https://`이고 HTTP `200`인지 확인
- [ ] 새 idempotency key로 Amoy 민팅
- [ ] 계약 `uri(tokenId)`가 메타데이터 URL을 반환하는지 확인
- [ ] 카드 응답의 `nftChain=POLYGON_AMOY`와 Polygon Amoy explorer 링크 확인
- [ ] 중복 요청에서 추가 `CardMinted` 이벤트가 없는지 확인

## 4. 자동 워커 활성화

- [ ] 3번 테스트가 모두 통과한 뒤 `CARD_GATCHA_NFT_WORKER_ENABLED=true`
- [ ] S3 자동 import가 필요할 때만 `CARD_GATCHA_NFT_S3_IMPORT_WORKER_ENABLED=true`
- [ ] CSMS candidate health 확인 후 managed container 교체
- [ ] 처리할 작업이 없는 상태에서 worker 오류 로그가 발생하지 않는지 확인
- [ ] 테스트 카드 1장으로 `READY_TO_MINT -> MINT_REQUESTED -> ISSUED` 자동 전이 확인
- [ ] 실패 작업이 재시도되더라도 같은 request ID로 중복 민팅되지 않는지 확인

## 5. Ethereum Sepolia

- [ ] faucet에서 `0x5A93682B7028f50F302db70c37a99eC6B3bd20e2`에 Sepolia ETH 충전
- [ ] 잔액 확인 후 `NETWORK_ENV=ethereum-sepolia`로 network check
- [ ] 동일 ERC-1155 코드를 Sepolia에 배포
- [ ] `config/networks.json`에 Sepolia contract address와 deployment block 기록
- [ ] 직접 mint와 동일 idempotency retry 확인
- [ ] `coin_csms` candidate runtime만 Sepolia로 전환하여 관리자 E2E 확인
- [ ] 카드 응답의 `nftChain=ETHEREUM_SEPOLIA`와 Sepolia Etherscan 링크 확인
- [ ] 검증 후 운영 runtime은 Polygon Amoy로 복구

## 6. Mainnet Gate

- [ ] Polygon mainnet과 Ethereum mainnet에 각각 전용 hot wallet 생성
- [ ] 테스트넷 private key를 mainnet에서 재사용하지 않음
- [ ] CloudFront metadata acceptance, Amoy 자동 E2E, Sepolia E2E가 모두 완료됐는지 확인
- [ ] 소액 gas만 충전하고 별도 mainnet ERC-1155 계약 배포
- [ ] controlled smoke mint 후 explorer, `uri(tokenId)`, 중복 방지 확인
- [ ] 최종 승인 전까지 mainnet worker는 비활성 유지

## 확인된 외부 차단 사항

- Sepolia minter balance가 `0 ETH`라 현재 계약 배포 불가
- EC2 role에는 CloudFront 조회/생성 및 S3 bucket-policy 조회 권한이 없음
- 실제 AWS 공개 origin 구성은 AWS 관리자 권한이 있는 사용자 작업이 필요
