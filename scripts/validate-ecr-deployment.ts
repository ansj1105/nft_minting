import { resolve } from "node:path";
import { loadEcrDeploymentManifest } from "../src/config/ecrDeploymentManifest.js";

const path = resolve(process.argv[2] ?? "deploy/ecr-images.json");
const manifest = loadEcrDeploymentManifest(path);
console.log(`validated ${manifest.images.length} ECR image definition(s)`);
