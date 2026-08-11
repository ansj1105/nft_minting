import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadEcrDeploymentManifest } from "../src/config/ecrDeploymentManifest.js";

const validManifest = {
  schemaVersion: 1,
  awsRegion: "us-east-1",
  accountId: "076472863936",
  publisherRoleName: "KorionGitHubEcrPublisherRole",
  deployerRoleName: "KorionNftMintingSsmDeployRole",
  images: [
    {
      key: "nft-minting",
      environment: "prod",
      hostKey: "foxya",
      project: "nft-minting",
      repository: "korion/prod/foxya/nft-minting",
      context: ".",
      dockerfile: "Dockerfile",
      platform: "linux/amd64",
      deployment: {
        driver: "docker-run",
        instanceId: "i-0958ccd4996b013d4",
        ssmDocument: "Korion-Deploy-NftMinting-Ecr",
        endpoint: "ubuntu@52.200.97.155",
        container: "nft-minting",
        candidateContainer: "nft-minting-candidate",
        network: "coin-shared",
        envFile: "/etc/korion/nft-minting/amoy.env",
        stateFile: "/var/lib/korion-deploy/nft-minting.env",
        healthUrl: "http://127.0.0.1:8088/health",
      },
    },
    {
      key: "nft-minting-sepolia",
      environment: "prod",
      hostKey: "foxya",
      project: "nft-minting",
      repository: "korion/prod/foxya/nft-minting",
      context: ".",
      dockerfile: "Dockerfile",
      platform: "linux/amd64",
      deployment: {
        driver: "docker-run",
        instanceId: "i-0958ccd4996b013d4",
        ssmDocument: "Korion-Deploy-NftMinting-Ecr",
        endpoint: "ubuntu@52.200.97.155",
        container: "nft-minting-sepolia",
        candidateContainer: "nft-minting-sepolia-candidate",
        network: "coin-shared",
        envFile: "/etc/korion/nft-minting/sepolia.env",
        stateFile: "/var/lib/korion-deploy/nft-minting-sepolia.env",
        healthUrl: "http://127.0.0.1:8088/health",
      },
    },
  ],
};

function writeManifest(value: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), "ecr-manifest-"));
  const file = join(directory, "ecr-images.json");
  writeFileSync(file, JSON.stringify(value));
  return file;
}

describe("ECR deployment manifest", () => {
  it("loads the versioned nft_minting deployment contract", () => {
    const manifest = loadEcrDeploymentManifest(writeManifest(validManifest));

    expect(manifest.images[0].repository).toBe("korion/prod/foxya/nft-minting");
    expect(manifest.publisherRoleName).toBe("KorionGitHubEcrPublisherRole");
    expect(manifest.deployerRoleName).toBe("KorionNftMintingSsmDeployRole");
    expect(manifest.images[0].deployment.instanceId).toBe("i-0958ccd4996b013d4");
    expect(manifest.images[0].deployment.stateFile).toBe(
      "/var/lib/korion-deploy/nft-minting.env",
    );
    expect(manifest.images[1].key).toBe("nft-minting-sepolia");
    expect(manifest.images[1].deployment.envFile).toBe(
      "/etc/korion/nft-minting/sepolia.env",
    );
  });

  it.each([
    ["missing repository", { ...validManifest, images: [{ ...validManifest.images[0], repository: "" }] }],
    ["unsupported driver", {
      ...validManifest,
      images: [{
        ...validManifest.images[0],
        deployment: { ...validManifest.images[0].deployment, driver: "kubernetes" },
      }],
    }],
    ["state outside operator directory", {
      ...validManifest,
      images: [{
        ...validManifest.images[0],
        deployment: { ...validManifest.images[0].deployment, stateFile: "/tmp/state.env" },
      }],
    }],
    ["repository prefix mismatch", {
      ...validManifest,
      images: [{ ...validManifest.images[0], repository: "korion/prod/homepage/nft-minting" }],
    }],
    ["secret-bearing field", { ...validManifest, images: validManifest.images, privateKey: "fake-only" }],
  ])("rejects %s", (_name, value) => {
    expect(() => loadEcrDeploymentManifest(writeManifest(value))).toThrow();
  });
});
