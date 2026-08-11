import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const digest = "a".repeat(64);
const image = `076472863936.dkr.ecr.us-east-1.amazonaws.com/korion/prod/foxya/nft-minting@sha256:${digest}`;

function run(script: string, env: Record<string, string>) {
  return spawnSync("bash", [resolve(root, "scripts", script)], {
    cwd: root,
    env: { ...process.env, DRY_RUN: "1", ECR_CONFIG: "deploy/ecr-images.json", ...env },
    encoding: "utf8",
  });
}

describe("ECR deployment scripts", () => {
  it("rejects mutable tag deployment", () => {
    const result = run("deploy-ecr-image.sh", {
      IMAGE_URI: "example.invalid/korion/prod/foxya/nft-minting:current",
      SOURCE_SHA: "abc123",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("immutable digest");
  });

  it("plans pull, candidate health, activation, pointer promotion, and atomic state", () => {
    const result = run("deploy-ecr-image.sh", { IMAGE_URI: image, SOURCE_SHA: "abc123" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ecr login");
    expect(result.stdout).toContain("clear temporary ECR login");
    expect(result.stdout).toContain("running image matches recorded current digest");
    expect(result.stdout).toContain("docker pull");
    expect(result.stdout).toContain("nft-minting-candidate");
    expect(result.stdout).toContain("health gate");
    expect(result.stdout).toContain("promote previous/current pointers");
    expect(result.stdout).toContain("atomic state update");
    expect(result.stdout).not.toContain("amoy.env contents");
  });

  it("selects the Sepolia deployment without exposing its env contents", () => {
    const result = run("deploy-ecr-image.sh", {
      IMAGE_URI: image,
      SOURCE_SHA: "abc123",
      DEPLOYMENT_KEY: "nft-minting-sepolia",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("nft-minting-sepolia-candidate");
    expect(result.stdout).toContain("/var/lib/korion-deploy/nft-minting-sepolia.env");
    expect(result.stdout).not.toContain("sepolia.env contents");
  });

  it("requires a distinct previous digest for rollback", () => {
    const result = run("rollback-ecr-image.sh", {});

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("previous image");
  });

  it("targets the custom SSM document without exposing the env file", () => {
    const result = run("deploy-via-ssm.sh", { IMAGE_URI: image, SOURCE_SHA: "abc123" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Korion-Deploy-NftMinting-Ecr");
    expect(result.stdout).toContain("i-0958ccd4996b013d4");
    expect(result.stdout).not.toContain("amoy.env contents");
  });

  it("deploys both testnet runtimes through the latest SSM document", () => {
    const wrapper = readFileSync(resolve(root, "scripts/deploy-via-ssm.sh"), "utf8");
    const document = readFileSync(resolve(root, "deploy/ssm/nft-minting-deploy.yml"), "utf8");
    const policy = readFileSync(resolve(root, "deploy/iam/nft-minting-github-ssm-policy.json"), "utf8");

    expect(wrapper).toContain("ssm update-document");
    expect(wrapper).toContain("--document-version '$LATEST'");
    expect(wrapper).toContain('run_command deploy nft-minting');
    expect(wrapper).toContain('run_command deploy nft-minting-sepolia');
    expect(document).toContain("DeploymentKey:");
    expect(document).toContain("/etc/korion/nft-minting/sepolia.env");
    expect(policy).toContain("ssm:UpdateDocument");
  });
});
