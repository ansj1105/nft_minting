#!/usr/bin/env bash
set -euo pipefail

config=${ECR_CONFIG:-deploy/ecr-images.json}
image_uri=${IMAGE_URI:-}
source_sha=${SOURCE_SHA:-}

if [[ ! "$image_uri" =~ @sha256:[0-9a-f]{64}$ ]]; then
  echo "IMAGE_URI must reference an immutable digest" >&2
  exit 2
fi
if [[ ! "$source_sha" =~ ^[0-9a-f]{6,40}$ ]]; then
  echo "SOURCE_SHA must be a hexadecimal git revision" >&2
  exit 2
fi

mapfile -t config_values < <(node - "$config" <<'NODE'
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const image = manifest.images.find((entry) => entry.key === "nft-minting");
if (!image) throw new Error("nft-minting image definition is missing");
const d = image.deployment;
for (const value of [manifest.awsRegion, manifest.accountId, image.repository, d.endpoint, d.container, d.candidateContainer, d.network, d.envFile, d.stateFile, d.healthUrl]) console.log(value);
NODE
)

if [[ ${#config_values[@]} -ne 10 ]]; then
  echo "invalid ECR deployment config" >&2
  exit 2
fi

region=${config_values[0]}
account_id=${config_values[1]}
repository=${config_values[2]}
endpoint=${config_values[3]}
container=${config_values[4]}
candidate=${config_values[5]}
network=${config_values[6]}
env_file=${config_values[7]}
state_file=${config_values[8]}
health_url=${config_values[9]}
registry="${account_id}.dkr.ecr.${region}.amazonaws.com"
expected_prefix="${registry}/${repository}@sha256:"
[[ "$image_uri" == "$expected_prefix"* ]] || { echo "IMAGE_URI does not match configured repository" >&2; exit 2; }

if [[ ${DRY_RUN:-0} == 1 ]]; then
  echo "[dry-run] ecr login on ${endpoint}"
  echo "[dry-run] verify running image matches recorded current digest"
  echo "[dry-run] docker pull ${image_uri}"
  echo "[dry-run] run ${candidate} on ${network} with env file path only"
  echo "[dry-run] health gate ${health_url}"
  echo "[dry-run] activate ${candidate} as ${container}"
  echo "[dry-run] promote previous/current pointers"
  echo "[dry-run] atomic state update ${state_file}"
  exit 0
fi

ssh_opts=(-o BatchMode=yes -o ConnectTimeout=15)
if [[ -n ${SSH_IDENTITY_FILE:-} ]]; then
  ssh_opts=(-i "$SSH_IDENTITY_FILE" "${ssh_opts[@]}")
fi
state=$(ssh "${ssh_opts[@]}" "$endpoint" sudo test -r "$state_file" '&&' sudo cat "$state_file")
old_current=$(sed -n 's/^CURRENT_IMAGE=//p' <<<"$state")
old_previous=$(sed -n 's/^PREVIOUS_IMAGE=//p' <<<"$state")
old_current_sha=$(sed -n 's/^CURRENT_SOURCE_SHA=//p' <<<"$state")
[[ "$old_current" =~ @sha256:[0-9a-f]{64}$ ]] || { echo "current deployment state is missing or invalid" >&2; exit 1; }
[[ "$old_current" != "$image_uri" ]] || { echo "requested digest is already current"; exit 0; }

ssh "${ssh_opts[@]}" "$endpoint" bash -s -- "$container" "$old_current" <<'REMOTE'
set -euo pipefail
container=$1 recorded_image=$2
running_id=$(sudo docker inspect --format '{{.Image}}' "$container")
recorded_id=$(sudo docker image inspect --format '{{.Id}}' "$recorded_image")
[[ "$running_id" == "$recorded_id" ]] || {
  echo "running container does not match recorded CURRENT_IMAGE" >&2
  exit 1
}
REMOTE

cleanup_candidate() {
  ssh "${ssh_opts[@]}" "$endpoint" sudo docker rm -f "$candidate" >/dev/null 2>&1 || true
}
trap cleanup_candidate EXIT

ssh "${ssh_opts[@]}" "$endpoint" bash -s -- "$image_uri" "$region" "$registry" "$candidate" "$network" "$env_file" "$health_url" <<'REMOTE'
set -euo pipefail
image_uri=$1 region=$2 registry=$3 candidate=$4 network=$5 env_file=$6 health_url=$7
aws ecr get-login-password --region "$region" | sudo docker login --username AWS --password-stdin "$registry" >/dev/null
sudo docker pull "$image_uri" >/dev/null
sudo docker rm -f "$candidate" >/dev/null 2>&1 || true
sudo docker run -d --name "$candidate" --restart unless-stopped --network "$network" --env-file "$env_file" "$image_uri" >/dev/null
for attempt in $(seq 1 20); do
  sudo docker exec "$candidate" wget -qO- "$health_url" >/dev/null && exit 0
  [[ "$attempt" -lt 20 ]] && sleep 2
done
sudo docker logs "$candidate" >&2 || true
exit 1
REMOTE

manifest_for() {
  local digest=${1##*@}
  aws ecr batch-get-image --region "$region" --repository-name "$repository" --image-ids imageDigest="$digest" --query 'images[0].imageManifest' --output text
}
put_pointer() {
  local tag=$1 uri=$2 manifest
  manifest=$(manifest_for "$uri")
  [[ "$manifest" != None ]] || { echo "ECR manifest missing for $tag" >&2; return 1; }
  aws ecr put-image --region "$region" --repository-name "$repository" --image-tag "$tag" --image-manifest "$manifest" >/dev/null
}

restore_pointers() {
  put_pointer current "$old_current" || true
  if [[ "$old_previous" =~ @sha256:[0-9a-f]{64}$ ]]; then
    put_pointer previous "$old_previous" || true
  else
    aws ecr batch-delete-image --region "$region" --repository-name "$repository" --image-ids imageTag=previous >/dev/null 2>&1 || true
  fi
}

restore_live() {
  ssh "${ssh_opts[@]}" "$endpoint" bash -s -- "$container" <<'REMOTE'
set -euo pipefail
container=$1 old_container="${1}-rollback"
sudo docker rm -f "$container" >/dev/null 2>&1 || true
sudo docker rename "$old_container" "$container"
REMOTE
}

if ! ssh "${ssh_opts[@]}" "$endpoint" bash -s -- "$container" "$candidate" "$health_url" <<'REMOTE'
set -euo pipefail
container=$1 candidate=$2 health_url=$3
old_container="${container}-rollback"
sudo docker rm -f "$old_container" >/dev/null 2>&1 || true
sudo docker rename "$container" "$old_container"
sudo docker rename "$candidate" "$container"
if ! sudo docker exec "$container" wget -qO- "$health_url" >/dev/null; then
  sudo docker rm -f "$container" >/dev/null 2>&1 || true
  sudo docker rename "$old_container" "$container"
  exit 1
fi
REMOTE
then
  exit 1
fi

promotion_ok=1
put_pointer previous "$old_current" || promotion_ok=0
if [[ "$promotion_ok" == 1 ]]; then
  put_pointer current "$image_uri" || promotion_ok=0
fi
if [[ "$promotion_ok" != 1 ]]; then
  restore_live || true
  restore_pointers
  exit 1
fi

if ! ssh "${ssh_opts[@]}" "$endpoint" bash -s -- "$container" "$state_file" "$image_uri" "$old_current" "$source_sha" "$old_current_sha" <<'REMOTE'
set -euo pipefail
container=$1 state_file=$2 current_image=$3 previous_image=$4 current_sha=$5 previous_sha=$6
old_container="${container}-rollback"
state_dir=$(dirname "$state_file")
sudo install -d -m 0700 "$state_dir"
tmp=$(mktemp)
printf 'CURRENT_IMAGE=%s\nPREVIOUS_IMAGE=%s\nCURRENT_SOURCE_SHA=%s\nPREVIOUS_SOURCE_SHA=%s\n' "$current_image" "$previous_image" "$current_sha" "$previous_sha" > "$tmp"
sudo install -o root -g root -m 0600 "$tmp" "${state_file}.new"
sudo mv "${state_file}.new" "$state_file"
rm -f "$tmp"
sudo docker rm -f "$old_container" >/dev/null 2>&1 || true
REMOTE
then
  restore_live || true
  restore_pointers
  exit 1
fi

if [[ ${ROLLBACK_MODE:-0} != 1 ]]; then
  aws ecr batch-delete-image --region "$region" --repository-name "$repository" --image-ids imageTag="candidate-${source_sha}" >/dev/null
fi
trap - EXIT
echo "deployed ${image_uri}"
