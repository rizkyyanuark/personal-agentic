#!/bin/sh
set -eu
umask 077
test "$(uname -m)" = aarch64
test "$(id -u)" = 1000
xz -dc src/ci-artifacts/agentic-enterprise.xz > src/ci-artifacts/agentic-enterprise
chmod 755 src/ci-artifacts/agentic-enterprise
export DOCKER_CONFIG="$(mktemp -d)"
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
case "$CI_REGISTRY_IMAGE" in
  "$CI_REGISTRY"/*) : ;;
  *) echo 'CI registry image does not belong to the registry' >&2; exit 1 ;;
esac
registry_host="${CI_REGISTRY%:443}"
registry_image="$registry_host/${CI_REGISTRY_IMAGE#"$CI_REGISTRY/"}"
registry_auth=$(printf '%s:%s' "$CI_REGISTRY_USER" "$CI_REGISTRY_PASSWORD" | base64 | tr -d '\n')
printf '{"auths":{"%s":{"auth":"%s"}}}\n' "$registry_host" "$registry_auth" > "$DOCKER_CONFIG/config.json"
unset registry_auth
cp infra/ci/buildkit-runc.sh /tmp/personal-agentic-runc
chmod 755 /tmp/personal-agentic-runc
printf '[worker.oci]\nmax-parallelism = 1\n' > /tmp/personal-agentic-buildkit.toml
buildctl-daemonless.sh build \
  --frontend dockerfile.v0 \
  --local context=src --local dockerfile=src \
  --opt target=platform --opt platform=linux/arm64 \
  --opt build-arg:FRONTEND_SOURCE=frontend-ci \
  --opt build-arg:BACKEND_SOURCE=backend-ci \
  --opt label:org.opencontainers.image.revision="$CI_COMMIT_SHA" \
  --opt label:org.opencontainers.image.source="$CI_PROJECT_URL" \
  --import-cache type=registry,ref="$registry_image/cache:$CI_COMMIT_REF_SLUG" \
  --export-cache type=registry,ref="$registry_image/cache:$CI_COMMIT_REF_SLUG",mode=min \
  --output type=image,name="$registry_image/platform:$CI_COMMIT_SHA",push=true \
  --metadata-file image-metadata.json
image_digest=$(sed -n 's/.*"containerimage.digest": "\(sha256:[0-9a-f]\{64\}\)".*/\1/p' image-metadata.json)
test "${#image_digest}" = 71
svg_digest=$(sha256sum src/frontend/public/harnesses/antigravity.svg | cut -d ' ' -f 1)
printf 'TESTED_IMAGE=%s/platform@%s\nSMOKE_EXPECTED_AGY_SHA256=%s\n' "$CI_REGISTRY_IMAGE" "$image_digest" "$svg_digest" > image.env
printf 'Published ARM64 image: %s/platform@%s\n' "$CI_REGISTRY_IMAGE" "$image_digest"
