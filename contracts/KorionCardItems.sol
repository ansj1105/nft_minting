// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract KorionCardItems is ERC1155, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    mapping(uint256 => string) private _tokenUris;
    mapping(bytes32 => bool) public mintedRequests;

    event CardMinted(
        bytes32 indexed requestHash,
        address indexed recipient,
        uint256 indexed tokenId,
        uint256 amount,
        string tokenUri
    );

    constructor(string memory baseUri, address admin) ERC1155(baseUri) {
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

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
