import { ethers } from "ethers";
import { NetworkConfig } from "./config.js";
import { MintRequest, tokenIdFor } from "./mint-request.js";
import { normalizePrivateKey } from "./private-key.js";

const contractAbi = [
  "function mintCard(address recipient,uint256 tokenId,uint256 amount,string tokenUri,bytes32 requestHash) external",
  "function mintedRequests(bytes32 requestHash) external view returns (bool)",
  "event CardMinted(bytes32 indexed requestHash,address indexed recipient,uint256 indexed tokenId,uint256 amount,string tokenUri)"
];

export interface MintResult {
  txHash: string;
  tokenId: string;
  contractAddress: string;
  tokenUri?: string;
  chain: string;
  chainId: number;
}

export interface MinterOptions {
  network: NetworkConfig;
  privateKey: string;
  provider?: ethers.Provider;
  signer?: ethers.ContractRunner;
}

export class NftMinter {
  private readonly provider: ethers.Provider;
  private readonly signer: ethers.ContractRunner;
  private readonly network: NetworkConfig;

  constructor(options: MinterOptions) {
    this.network = options.network;
    this.provider = options.provider || new ethers.JsonRpcProvider(options.network.rpcUrl, options.network.chainId);
    this.signer = options.signer || new ethers.Wallet(normalizePrivateKey(options.privateKey), this.provider);
  }

  isConfigured(): boolean {
    return Boolean(this.network.contractAddress && this.network.contractAddress.trim());
  }

  async mint(request: MintRequest): Promise<MintResult> {
    if (!this.isConfigured()) {
      throw badRequest("MINTER_NOT_CONFIGURED", "CONTRACT_ADDRESS is required.");
    }
    if (request.chain && request.chain !== this.network.chain) {
      throw badRequest("CHAIN_MISMATCH", `Request chain '${request.chain}' does not match '${this.network.chain}'.`);
    }
    if (request.contractAddress && request.contractAddress.toLowerCase() !== this.network.contractAddress.toLowerCase()) {
      throw badRequest("CONTRACT_MISMATCH", "Request contractAddress does not match configured contract.");
    }

    const requestHash = ethers.id(request.idempotencyKey);
    const tokenId = tokenIdFor(request);
    const contract = new ethers.Contract(this.network.contractAddress, contractAbi, this.signer);
    const alreadyMinted = await contract.mintedRequests(requestHash);
    if (alreadyMinted) {
      const existing = await this.findExistingMint(contract, requestHash, request);
      if (existing) {
        return existing;
      }
      throw conflict("ALREADY_MINTED", "Idempotency key was already minted on-chain but the original tx could not be resolved.");
    }

    const tx = await contract.mintCard(
      request.recipientAddress,
      tokenId,
      1,
      request.tokenUri || "",
      requestHash
    );
    const receipt = await tx.wait();
    if (!receipt?.hash) {
      throw new Error("Mint transaction receipt missing hash.");
    }

    return {
      txHash: receipt.hash,
      tokenId: tokenId.toString(),
      contractAddress: this.network.contractAddress,
      tokenUri: request.tokenUri,
      chain: this.network.chain,
      chainId: this.network.chainId
    };
  }

  private async findExistingMint(
    contract: ethers.Contract,
    requestHash: string,
    request: MintRequest
  ): Promise<MintResult | null> {
    const filter = contract.filters.CardMinted(requestHash);
    const events = await contract.queryFilter(filter, this.network.deploymentBlock ?? 0, "latest");
    const event = events.at(-1);
    if (!event || !("args" in event) || !event.args) {
      return null;
    }
    return {
      txHash: event.transactionHash,
      tokenId: event.args.tokenId.toString(),
      contractAddress: this.network.contractAddress,
      tokenUri: request.tokenUri || event.args.tokenUri,
      chain: this.network.chain,
      chainId: this.network.chainId
    };
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function badRequest(code: string, message: string): ApiError {
  return new ApiError(400, code, message);
}

function conflict(code: string, message: string): ApiError {
  return new ApiError(409, code, message);
}
