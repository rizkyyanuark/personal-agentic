#!/usr/bin/env bash
set +x
set -euo pipefail
umask 077
fail() { printf '%s\n' "$*" >&2; exit 1; }
for tool in curl jq unzip zipinfo sha256sum realpath od systemctl; do
  command -v "$tool" >/dev/null || fail "Missing runtime prerequisite: $tool. No compiler is required."
done
[[ $(uname -s) == Linux && $(uname -m) == aarch64 ]] || fail 'Prebuilt setup supports Linux ARM64; select source installation explicitly for this platform.'
systemctl --user show-environment >/dev/null || fail 'A user systemd session is required. Login as the worker user; use source/direct mode otherwise.'
controller=${AE_CONTROLLER_URL:-}
[[ -n $controller ]] || read -rp 'Reachable controller URL: ' controller
controller=${controller%/}
[[ $controller =~ ^https?://([A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])(:[0-9]+)?$ ]] || fail 'Use an HTTP(S) origin without a path, query, or credentials.'
if [[ $controller == http://* && ! $controller =~ ^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?$ ]]; then
  fail 'Remote controllers require HTTPS. Use a trusted private HTTPS endpoint.'
fi
curl --fail --silent --show-error --connect-timeout 10 --max-time 20 "$controller/api/health" >/dev/null || fail 'Controller health failed. Check hostname, TLS, host allowlist, and network access.'
root=${AE_WORKDIR:-}
[[ -n $root ]] || read -rp 'Absolute project folder: ' root
[[ $root == /* && $root != / ]] || fail 'Choose an absolute project folder, not filesystem root.'
if [[ ! -d $root ]]; then
  read -rp 'Folder does not exist. Create it? [y/N] ' answer
  [[ $answer == y || $answer == Y ]] || fail 'Folder creation declined.'
  mkdir -p -- "$root"
fi
root=$(realpath -- "$root")
[[ -r $root && -w $root && $root != *$'\n'* && $root != *'%'* && $root != *'"'* && $root != *'\'* && $root != *'$'* ]] || fail 'Folder must be readable/writable; newline, percent, quote, dollar and backslash paths are not supported by this service installer.'
home=${AE_INSTALL_DIR:-$HOME/.local/share/agentic-worker}
mkdir -p -- "$home"
home=$(realpath -- "$home")
[[ $home != / ]] || fail 'Choose a dedicated worker installation directory, not filesystem root.'
[[ $home != *'%'* && $home != *'"'* && $home != *'\'* && $home != *'$'* && $home != *$'\n'* ]] || fail 'Unsupported install-directory characters.'
meta="$home/installation.json"
[[ ! -f $home/registration.json || -f $meta ]] || fail 'Legacy worker state found. Preserve its service/state; use a separate install directory for a new registration or migrate explicitly.'
key=$(printf %s "$home" | sha256sum | cut -c1-12)
service="agentic-worker-$key"
unit="$HOME/.config/systemd/user/$service.service"
temp=$(mktemp -d)
trap 'rm -rf -- "$temp"; unset AE_ENROLLMENT_TOKEN token credential' EXIT
credential=''
auth() {
  [[ $credential =~ ^[A-Za-z0-9-]+$ ]] || fail 'Invalid token format.'
  printf 'header = "Authorization: Bearer %s"\n' "$credential" > "$temp/auth"
}
request() { curl --config "$temp/auth" --fail --silent --show-error --connect-timeout 10 --max-time 120 "$@"; }
package_request() {
  local url=$1 output=$2 code
  if ! code=$(curl --config "$temp/auth" --silent --show-error --connect-timeout 10 --max-time 120 --max-filesize 134217728 --output "$output" --write-out '%{http_code}' "$url"); then
    fail 'Worker package request could not reach the controller. Check DNS, TLS and network access; registration is unchanged.'
  fi
  case "$code" in
    200) ;;
    401) fail 'Runtime token rejected (HTTP 401): invalid, expired, consumed, or revoked. Use a fresh UI token, or explicitly replace a revoked saved registration.' ;;
    403) fail 'Runtime access denied (HTTP 403). Check workspace permissions before retrying.' ;;
    404) fail 'Worker package endpoint unavailable (HTTP 404). Check the controller URL and upgrade the controller.' ;;
    503) fail 'Verified worker package unavailable (HTTP 503). The operator must publish and configure both Windows x64 and Linux ARM64 packages. Replacing your token will not fix package availability.' ;;
    *) fail "Worker package request failed (HTTP $code). Check controller service health before retrying." ;;
  esac
}
state="$home/state"
if [[ -f $unit ]]; then
  [[ -f $meta ]] || fail 'Existing service is not owned by this installer; refusing takeover.'
  [[ $(sha256sum "$unit" | cut -d' ' -f1) == "$(jq -r .unit_sha256 "$meta")" ]] || fail 'Service was customized; preserve it and use a separate install directory.'
fi
if [[ -f $meta ]]; then
  state=$(jq -r .state "$meta")
  [[ $state == "$home"/* ]] || fail 'Saved state is outside install directory.'
fi
if [[ -f $state/registration.json ]]; then
    credential=$(jq -r .token "$state/registration.json"); auth
    compatible=false
    if [[ $(jq -r .url "$state/registration.json") == "$controller" ]]; then
      if request "$controller/api/runtime/status" > "$temp/status"; then
        if [[ -f $meta ]]; then
          [[ $(jq -r .root "$meta") != "$root" ]] || compatible=true
        elif jq -e --arg root "$root" '.root==null or .root==$root' "$temp/status" >/dev/null; then compatible=true
        fi
      fi
    fi
    if [[ $compatible != true || ${AE_REPLACE_REGISTRATION:-0} == 1 ]]; then
      if [[ ${AE_REPLACE_REGISTRATION:-0} != 1 ]]; then
        read -rp 'Registration is incompatible/revoked/unreachable. Preserve it and replace explicitly? [y/N] ' answer
        [[ $answer == y || $answer == Y ]] || fail 'Existing registration retained.'
      fi
      state="$home/state-$(date +%s)-$$"
      credential=''
    fi
fi
if [[ -z $credential ]]; then
  token=${AE_ENROLLMENT_TOKEN:-}
  [[ -n $token ]] || { read -rsp 'Enrollment token (hidden): ' token; printf '\n'; }
  credential=$token
  auth
fi
unset AE_ENROLLMENT_TOKEN
manifest="$temp/manifest.json"
package_request "$controller/api/runtime/packages/linux-arm64/manifest" "$manifest"
jq -e '.schema==1 and .protocol==1 and .platform=="linux-arm64" and (.release|test("^[0-9a-f]{40}$")) and .package.file=="worker-linux-arm64.zip" and (.package.sha256|test("^[0-9a-f]{64}$")) and .package.size>0 and .package.size<=134217728 and (.package.files|length)==1 and .package.files[0].name=="agentic-enterprise" and .package.files[0].size<=805306368' "$manifest" >/dev/null || fail 'Incompatible/unsafe worker manifest.'
release=$(jq -r .release "$manifest")
printf 'Selected verified release %s for Linux ARM64. Preparing binary package...\n' "$release"
digest=$(jq -r .package.sha256 "$manifest")
cache="$home/cache/$digest.zip"
mkdir -p "$home/cache" "$home/versions"
if [[ ! -f $cache ]] || [[ $(sha256sum "$cache" | cut -d' ' -f1) != "$digest" ]]; then
  package_request "$controller/api/runtime/packages/linux-arm64/archive" "$temp/package.zip"
  [[ $(sha256sum "$temp/package.zip" | cut -d' ' -f1) == "$digest" ]] || fail 'Worker package checksum mismatch.'
  mv -- "$temp/package.zip" "$cache"
fi
[[ $(stat -c %s "$cache") == "$(jq -r .package.size "$manifest")" ]] || fail 'Package size mismatch.'
[[ $(unzip -Z1 "$cache") == agentic-enterprise ]] || fail 'Archive has unexpected, duplicate or unsafe paths.'
! zipinfo -l "$cache" | grep -q '^l' || fail 'Archive symlinks are forbidden.'
[[ $(LC_ALL=C unzip -l "$cache" | awk '$4=="agentic-enterprise" {print $1}') == "$(jq -r '.package.files[0].size' "$manifest")" ]] || fail 'Archive expansion size mismatch.'
mkdir "$temp/extract"
unzip -qq "$cache" -d "$temp/extract"
binary="$temp/extract/agentic-enterprise"
[[ ! -L $binary && -f $binary ]] || fail 'Invalid worker executable.'
[[ $(sha256sum "$binary" | cut -d' ' -f1) == "$(jq -r '.package.files[0].sha256' "$manifest")" ]] || fail 'Executable checksum mismatch.'
[[ $(stat -c %s "$binary") == "$(jq -r '.package.files[0].size' "$manifest")" ]] || fail 'Executable size mismatch.'
[[ $(od -An -tx1 -N6 "$binary" | tr -d ' \n') == 7f454c460201 && $(od -An -tu2 -j18 -N2 "$binary" | tr -d ' ') == 183 ]] || fail 'Wrong executable architecture.'
chmod 700 "$binary"
"$binary" --version >/dev/null || fail 'Worker runtime dependencies are missing. See package prerequisites; source building is not automatic.'
version="$home/versions/$release-$digest"
if [[ ! -d $version ]]; then mv -- "$temp/extract" "$version"; fi
binary="$version/agentic-enterprise"
[[ $(sha256sum "$binary" | cut -d' ' -f1) == "$(jq -r '.package.files[0].sha256' "$manifest")" ]] || fail 'Installed executable was modified; preserve it and restore the verified release.'
mkdir -p "$state"; chmod 700 "$state"
if [[ -f $unit ]]; then systemctl --user stop "$service"; fi
if [[ ! -f $state/registration.json ]]; then
  AE_CONTROLLER_URL="$controller" AE_ENROLLMENT_TOKEN="$credential" "$binary" --worker --worker-state "$state" --worker-root "$root" --enroll-only || fail 'Enrollment failed. Preserve state and request a fresh token if expired/used.'
fi
unset token credential
credential=$(jq -r .token "$state/registration.json"); auth
identity=$(jq -r .id "$state/registration.json")
workspace=$(jq -r .workspace "$state/registration.json")
request "$controller/api/runtime/status" > "$temp/baseline"
baseline=$(jq -r '.heartbeat // 0' "$temp/baseline")
mkdir -p "$(dirname "$unit")"
if [[ -f $unit ]]; then cp -- "$unit" "$home/service.previous"; fi
if [[ -f $meta ]]; then cp -- "$meta" "$home/installation.previous.json"; fi
cat > "$unit" <<EOF
[Unit]
Description=Agentic Enterprise worker ($key)
After=network-online.target
StartLimitIntervalSec=0
[Service]
ExecStart="$binary" --worker --worker-state "$state" --worker-root "$root"
Environment="PATH=$HOME/.local/bin:$HOME/.cargo/bin:/usr/local/bin:/usr/bin:/bin"
Restart=always
RestartSec=15
KillMode=control-group
UMask=0077
[Install]
WantedBy=default.target
EOF
jq -n --arg controller "$controller" --arg root "$root" --arg state "$state" --arg service "$service" --arg release "$release" --arg binary "$binary" --arg unit_sha256 "$(sha256sum "$unit" | cut -d' ' -f1)" '{controller:$controller,root:$root,state:$state,service:$service,release:$release,binary:$binary,unit_sha256:$unit_sha256}' > "$meta"
systemctl --user daemon-reload
systemctl --user enable --now "$service"
printf 'Installed release %s; enrolled; service started. Waiting for controller-confirmed Online...\n' "$release"
deadline=$((SECONDS+60))
while ((SECONDS<deadline)); do
  remaining=$((deadline-SECONDS))
  timeout=$((remaining<5 ? remaining : 5))
  if request --connect-timeout "$timeout" --max-time "$timeout" "$controller/api/runtime/status" > "$temp/status" && jq -e --arg id "$identity" --arg workspace "$workspace" --arg root "$root" --argjson baseline "$baseline" '.id==$id and .workspace==$workspace and .root==$root and .online==true and .heartbeat>$baseline' "$temp/status" >/dev/null; then
    printf 'Online: runtime %s in workspace %s. Harness login is a separate step.\n' "$identity" "$workspace"
    printf 'Status: systemctl --user status %s\nStartup before login requires administrator-approved loginctl enable-linger.\n' "$service"
    exit 0
  fi
  ((SECONDS>=deadline)) || sleep 1
done
fail "Enrolled and service started, but Online was not confirmed within 60 seconds. Check: journalctl --user -u $service. Rerun setup to verify/reconnect; do not create another runtime automatically."
