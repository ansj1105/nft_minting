import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");

describe("ECR delivery workflow", () => {
  it("builds and pushes on GitHub-hosted infrastructure through OIDC", () => {
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("build_push:");
    expect(workflow).toContain("aws-actions/configure-aws-credentials@");
    expect(workflow).toContain("aws-actions/amazon-ecr-login@");
    expect(workflow).toContain("docker/build-push-action@");
    expect(workflow).toContain("candidate-${{ github.sha }}");
    expect(workflow).toContain("deploy/ecr-images.json");
    expect(workflow).toContain("needs.build_push.outputs.registry");
    expect(workflow).not.toContain("ECR_REPOSITORY:");
    expect(workflow).not.toContain("AWS_ROLE_ARN:");
  });

  it("deploys an exported digest through repository-scoped SSM", () => {
    expect(workflow).toContain("scripts/deploy-via-ssm.sh");
    expect(workflow).toContain("@${{ needs.build_push.outputs.digest }}");
    expect(workflow).toContain("deployer_role_arn");
    expect(workflow).toContain("runs-on: ubuntu-latest");
    expect(workflow).not.toContain("runs-on: [self-hosted");
    expect(workflow).not.toContain("command -v python3 aws ssh");
    expect(workflow).not.toMatch(/^         run:/m);
    expect(workflow).not.toContain("git bundle create");
    expect(workflow).not.toContain("sudo docker build");
  });
});
