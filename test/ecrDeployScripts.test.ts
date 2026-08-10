import { spawnSync } from "node:child_process";
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
    expect(result.stdout).toContain("running image matches recorded current digest");
    expect(result.stdout).toContain("docker pull");
    expect(result.stdout).toContain("nft-minting-candidate");
    expect(result.stdout).toContain("health gate");
    expect(result.stdout).toContain("promote previous/current pointers");
    expect(result.stdout).toContain("atomic state update");
    expect(result.stdout).not.toContain("amoy.env contents");
  });

  it("requires a distinct previous digest for rollback", () => {
    const result = run("rollback-ecr-image.sh", {});

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("previous image");
  });
});
