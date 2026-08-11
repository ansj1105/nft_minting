// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract KorionCardItems is ERC1155, AccessControl, EIP712 {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 private constant CLAIM_TYPEHASH = keccak256(
        "CardClaim(address recipient,address source,uint256 tokenId,uint256 amount,bytes32 tokenUriHash,bytes32 requestHash,uint256 deadline)"
    );

    mapping(uint256 => string) private _tokenUris;
    mapping(bytes32 => bool) public mintedRequests;

    event CardMinted(
        bytes32 indexed requestHash,
        address indexed recipient,
        uint256 indexed tokenId,
        uint256 amount,
        string tokenUri
    );

    event CardClaimed(
        bytes32 indexed requestHash,
        address indexed recipient,
        address indexed payer,
        address source,
        uint256 tokenId,
        uint256 amount,
        string tokenUri
    );

    constructor(string memory baseUri, address admin) ERC1155(baseUri) EIP712("KORION Card Claim", "1") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        string memory tokenUri = _tokenUris[tokenId];
        if (bytes(tokenUri).length != 0) {
            return tokenUri;
        }
        return super.uri(tokenId);
    }

    function claimVersion() external pure returns (uint256) {
        return 1;
    }

    function mintCard(
        address recipient,
        uint256 tokenId,
        uint256 amount,
        string calldata tokenUri_,
        bytes32 requestHash
    ) external onlyRole(MINTER_ROLE) {
        require(recipient != address(0), "recipient required");
        require(amount > 0, "amount required");
        require(requestHash != bytes32(0), "request required");
        require(!mintedRequests[requestHash], "request already minted");

        mintedRequests[requestHash] = true;
        if (bytes(tokenUri_).length != 0) {
            _tokenUris[tokenId] = tokenUri_;
        }
        _mint(recipient, tokenId, amount, "");
        emit CardMinted(requestHash, recipient, tokenId, amount, tokenUri_);
    }

    function claimCard(
        address recipient,
        address source,
        uint256 tokenId,
        uint256 amount,
        string calldata tokenUri_,
        bytes32 requestHash,
        uint256 deadline,
        bytes calldata signature
    ) external {
        require(recipient != address(0), "recipient required");
        require(amount > 0, "amount required");
        require(requestHash != bytes32(0), "request required");
        require(block.timestamp <= deadline, "claim expired");
        require(!mintedRequests[requestHash], "request already claimed");

        bytes32 structHash = keccak256(abi.encode(
            CLAIM_TYPEHASH,
            recipient,
            source,
            tokenId,
            amount,
            keccak256(bytes(tokenUri_)),
            requestHash,
            deadline
        ));
        address authorizer = ECDSA.recover(_hashTypedDataV4(structHash), signature);
        require(hasRole(MINTER_ROLE, authorizer), "invalid claim signer");
        require(source == address(0) || source == authorizer, "invalid claim source");

        mintedRequests[requestHash] = true;
        if (bytes(tokenUri_).length != 0) {
            _tokenUris[tokenId] = tokenUri_;
        }
        if (source == address(0)) {
            _mint(recipient, tokenId, amount, "");
        } else {
            _safeTransferFrom(source, recipient, tokenId, amount, "");
        }
        emit CardClaimed(requestHash, recipient, msg.sender, source, tokenId, amount, tokenUri_);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
