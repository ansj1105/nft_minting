import { readFileSync } from "node:fs";
import { z } from "zod";

const secretKeyPattern = /PRIVATE_KEY|SECRET|TOKEN|API_KEY|PASSWORD|MNEMONIC/i;

const deploymentSchema = z.object({
  driver: z.literal("docker-run"),
  endpoint: z.string().regex(/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/),
  container: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/),
  candidateContainer: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/),
  network: z.string().min(1),
  envFile: z.string().startsWith("/"),
  stateFile: z.string().startsWith("/var/lib/korion-deploy/"),
  healthUrl: z.string().url().startsWith("http://127.0.0.1:"),
}).strict();

const imageSchema = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]+$/),
  environment: z.enum(["prod", "test"]),
  hostKey: z.string().regex(/^[a-z0-9][a-z0-9-]+$/),
  project: z.string().regex(/^[a-z0-9][a-z0-9-]+$/),
  repository: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/),
  context: z.string().min(1),
  dockerfile: z.string().min(1),
  platform: z.literal("linux/amd64"),
  deployment: deploymentSchema,
}).strict().superRefine((image, context) => {
  const expected = `korion/${image.environment}/${image.hostKey}/${image.project}`;
  if (image.repository !== expected) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["repository"],
      message: `Repository must match logical deployment path ${expected}`,
    });
  }
});

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  awsRegion: z.string().regex(/^[a-z]{2}-[a-z]+-\d$/),
  accountId: z.string().regex(/^\d{12}$/),
  publisherRoleName: z.string().regex(/^[A-Za-z0-9+=,.@_-]{1,64}$/),
  images: z.array(imageSchema).min(1),
}).strict();

export type EcrDeploymentManifest = z.infer<typeof manifestSchema>;

function rejectSecretBearingKeys(value: unknown, path = "manifest"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSecretBearingKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value)) {
    if (secretKeyPattern.test(key)) {
      throw new Error(`Secret-bearing field is not allowed in ECR deployment config: ${path}.${key}`);
    }
    rejectSecretBearingKeys(nested, `${path}.${key}`);
  }
}

export function loadEcrDeploymentManifest(path: string): EcrDeploymentManifest {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  rejectSecretBearingKeys(parsed);
  return manifestSchema.parse(parsed);
}
