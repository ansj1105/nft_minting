#!/usr/bin/env bash
set -euo pipefail

config=${ECR_CONFIG:-deploy/ecr-images.json}; image_uri=${IMAGE_URI:-}; source_sha=${SOURCE_SHA:-}; action=${ACTION:-deploy}
mapfile -t values < <(node - "$config" <<'NODE'
const fs=require('node:fs'); const m=JSON.parse(fs.readFileSync(process.argv[2],'utf8')); const i=m.images.find(x=>x.key==='nft-minting'); const d=i.deployment;
for (const value of [m.awsRegion,m.accountId,i.repository,d.instanceId,d.ssmDocument]) console.log(value);
NODE
)
region=${values[0]}; account=${values[1]}; repository=${values[2]}; instance_id=${values[3]}; document=${values[4]}
registry="${account}.dkr.ecr.${region}.amazonaws.com"; image_prefix="${registry}/${repository}@sha256:"
[[ "$action" == deploy || "$action" == rollback ]] || { echo 'ACTION must be deploy or rollback' >&2; exit 2; }
if [[ "$action" == deploy ]]; then
  [[ "$image_uri" == "$image_prefix"* && ${#image_uri} -eq $((${#image_prefix}+64)) ]] || { echo 'IMAGE_URI must reference the configured immutable digest' >&2; exit 2; }
  [[ "${image_uri##*@sha256:}" =~ ^[0-9a-f]{64}$ && "$source_sha" =~ ^[0-9a-f]{6,40}$ ]] || { echo 'invalid digest or source revision' >&2; exit 2; }
fi
if [[ ${DRY_RUN:-0} == 1 ]]; then echo "[dry-run] action=${action} document=${document} instance=${instance_id}"; exit 0; fi
aws ssm describe-document --region "$region" --name "$document" >/dev/null
[[ $(aws ssm describe-instance-information --region "$region" --filters "Key=InstanceIds,Values=${instance_id}" --query 'InstanceInformationList[0].PingStatus' --output text) == Online ]] || exit 1
manifest_for(){ aws ecr batch-get-image --region "$region" --repository-name "$repository" --image-ids "imageDigest=$1" --query 'images[0].imageManifest' --output text; }
put_pointer(){ local tag=$1 digest=$2 manifest; manifest=$(manifest_for "$digest"); [[ -n "$manifest" && "$manifest" != None ]] || return 1; aws ecr put-image --region "$region" --repository-name "$repository" --image-tag "$tag" --image-manifest "$manifest" >/dev/null; }
run_command(){
  local command_action=$1 command_image=${2:-} command_sha=${3:-} expected=${4:-} command_id status parameters
  parameters=$(node -e 'const v={Action:[process.argv[1]]};if(process.argv[1]==="deploy")Object.assign(v,{ImageUri:[process.argv[2]],SourceSha:[process.argv[3]],ExpectedCurrentImage:[process.argv[4]]});console.log(JSON.stringify(v))' "$command_action" "$command_image" "$command_sha" "$expected")
  command_id=$(aws ssm send-command --region "$region" --instance-ids "$instance_id" --document-name "$document" --comment "nft_minting ${command_action} ${source_sha:-manual}" --parameters "$parameters" --timeout-seconds 900 --max-concurrency 1 --max-errors 0 --query 'Command.CommandId' --output text)
  for _ in $(seq 1 190); do status=$(aws ssm get-command-invocation --region "$region" --command-id "$command_id" --instance-id "$instance_id" --query Status --output text 2>/dev/null || true); case "$status" in Success) aws ssm get-command-invocation --region "$region" --command-id "$command_id" --instance-id "$instance_id" --query StandardOutputContent --output text; return 0;; Failed|Cancelled|TimedOut|Cancelling) aws ssm get-command-invocation --region "$region" --command-id "$command_id" --instance-id "$instance_id" --query '{Status:Status,Output:StandardOutputContent,Error:StandardErrorContent}' --output json >&2 || true; return 1;; esac; sleep 5; done; return 1
}
current_digest=$(aws ecr describe-images --region "$region" --repository-name "$repository" --image-ids imageTag=current --query 'imageDetails[0].imageDigest' --output text)
[[ "$current_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || exit 1
if [[ "$action" == rollback ]]; then previous_digest=$(aws ecr describe-images --region "$region" --repository-name "$repository" --image-ids imageTag=previous --query 'imageDetails[0].imageDigest' --output text); [[ "$previous_digest" =~ ^sha256:[0-9a-f]{64}$ && "$previous_digest" != "$current_digest" ]] || exit 1; run_command rollback; put_pointer current "$previous_digest"; put_pointer previous "$current_digest" || true; exit 0; fi
new_digest=${image_uri##*@}; [[ "$new_digest" != "$current_digest" ]] || { echo 'requested digest is already current'; exit 0; }
run_command deploy "$image_uri" "$source_sha" "${registry}/${repository}@${current_digest}"
if ! put_pointer previous "$current_digest" || ! put_pointer current "$new_digest"; then run_command rollback || true; exit 1; fi
aws ecr batch-delete-image --region "$region" --repository-name "$repository" --image-ids "imageTag=candidate-${source_sha}" >/dev/null 2>&1 || true
echo "deployed ${image_uri} through SSM"
