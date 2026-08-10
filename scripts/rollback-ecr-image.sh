#!/usr/bin/env bash
set -euo pipefail

config=${ECR_CONFIG:-deploy/ecr-images.json}

if [[ ${DRY_RUN:-0} == 1 ]]; then
  [[ -n ${PREVIOUS_IMAGE:-} ]] || { echo "previous image is required for rollback" >&2; exit 2; }
  [[ ${PREVIOUS_IMAGE} != "${CURRENT_IMAGE:-}" ]] || { echo "previous image must differ from current" >&2; exit 2; }
  IMAGE_URI=$PREVIOUS_IMAGE SOURCE_SHA=${PREVIOUS_SOURCE_SHA:-000000} ROLLBACK_MODE=1 ECR_CONFIG=$config DRY_RUN=1 \
    bash "$(dirname "$0")/deploy-ecr-image.sh"
  exit 0
fi

mapfile -t target_values < <(node - "$config" <<'NODE'
const fs = require("node:fs");
const image = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).images.find((entry) => entry.key === "nft-minting");
console.log(image.deployment.endpoint);
console.log(image.deployment.stateFile);
NODE
)
endpoint=${target_values[0]}
state_file=${target_values[1]}
ssh_opts=(-o BatchMode=yes -o ConnectTimeout=15)
if [[ -n ${SSH_IDENTITY_FILE:-} ]]; then
  ssh_opts=(-i "$SSH_IDENTITY_FILE" "${ssh_opts[@]}")
fi
state=$(ssh "${ssh_opts[@]}" "$endpoint" sudo test -r "$state_file" '&&' sudo cat "$state_file")
previous=$(sed -n 's/^PREVIOUS_IMAGE=//p' <<<"$state")
current=$(sed -n 's/^CURRENT_IMAGE=//p' <<<"$state")
previous_sha=$(sed -n 's/^PREVIOUS_SOURCE_SHA=//p' <<<"$state")
[[ "$previous" =~ @sha256:[0-9a-f]{64}$ ]] || { echo "previous image is missing or invalid" >&2; exit 1; }
[[ "$previous" != "$current" ]] || { echo "previous image must differ from current" >&2; exit 1; }
IMAGE_URI=$previous SOURCE_SHA=$previous_sha ROLLBACK_MODE=1 ECR_CONFIG=$config \
  bash "$(dirname "$0")/deploy-ecr-image.sh"
