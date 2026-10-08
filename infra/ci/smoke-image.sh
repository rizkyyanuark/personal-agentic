#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${SMOKE_EXPECTED_AGY_SHA256:?Set the source Antigravity SVG SHA-256 before running the image smoke}"
[[ "$SMOKE_EXPECTED_AGY_SHA256" =~ ^[a-f0-9]{64}$ ]] || {
  echo 'Invalid source Antigravity SVG SHA-256' >&2
  exit 1
}
[[ "$(uname -m)" == aarch64 ]] || {
  echo 'The image smoke must run natively on ARM64' >&2
  exit 1
}

frontend_dir=/app/frontend
smoke_dir=$(mktemp -d /tmp/personal-agentic-image-smoke.XXXXXXXX)
server_pid=
cleanup() {
  local result=$?
  trap - EXIT
  if [[ "$result" -ne 0 && -s "$smoke_dir/server.log" ]]; then
    tail -n 20 "$smoke_dir/server.log" >&2
  fi
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
    for _ in {1..10}; do
      kill -0 "$server_pid" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$server_pid" 2>/dev/null; then
      kill -KILL "$server_pid" 2>/dev/null || true
    fi
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -rf -- "$smoke_dir"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

base=http://127.0.0.1:8765
body="$smoke_dir/response"
cookies="$smoke_dir/cookies"
unset AE_MATRIX_HOMESERVER AE_MATRIX_BOT_USERNAME AE_MATRIX_BOT_PASSWORD
agentic-enterprise --org "$smoke_dir/org" --bind 127.0.0.1 --port 8765 \
  --frontend "$frontend_dir" >"$smoke_dir/server.log" 2>&1 &
server_pid=$!

ready=false
for _ in {1..90}; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo 'Packaged controller exited before becoming ready' >&2
    exit 1
  fi
  if curl --silent --fail --max-time 2 "$base/api/health" >"$body"; then
    ready=true
    break
  fi
  sleep 1
done
[[ "$ready" == true ]] || {
  echo 'Packaged controller did not become ready within 90 seconds' >&2
  exit 1
}
perl -MJSON::PP -0777 -e '
  my $v = decode_json(<>);
  die "Invalid controller health response\n"
    unless $v->{status} eq "ok" && $v->{product} eq "Agentic Enterprise";
' "$body"

request() {
  local expected=$1 path=$2 status
  shift 2
  status=$(curl --silent --show-error --max-time 15 --output "$body" \
    --write-out '%{http_code}' "$@" "$base$path")
  if [[ "$status" != "$expected" ]]; then
    printf '%s returned HTTP %s; expected %s\n' "$path" "$status" "$expected" >&2
    exit 1
  fi
}

request 401 /api/state
request 401 /api/cockpit/state
request 401 /api/login --header 'Content-Type: application/json' \
  --data '{"token":"invalid-image-smoke-key"}'
perl -MJSON::PP -0777 -e '
  my $token = <>; $token =~ s/\s+\z//;
  print encode_json({token => $token});
' "$smoke_dir/org/.state/owner.key" >"$smoke_dir/login.json"
request 200 /api/login --header 'Content-Type: application/json' \
  --cookie-jar "$cookies" --data-binary "@$smoke_dir/login.json"
perl -MJSON::PP -0777 -e '
  my $v = decode_json(<>);
  die "Owner login did not return owner identity\n" unless $v->{ok} && $v->{user} eq "owner";
' "$body"

request 200 /api/me --cookie "$cookies"
perl -MJSON::PP -0777 -e '
  die "Authenticated identity is not owner\n" unless decode_json(<>)->{user} eq "owner";
' "$body"
request 200 /api/state --cookie "$cookies"
perl -MJSON::PP -0777 -e '
  my $v = decode_json(<>);
  die "Invalid authenticated workspace state\n"
    unless ref($v) eq "HASH" && ref($v->{agents}) eq "ARRAY" && ref($v->{groups}) eq "ARRAY";
' "$body"
request 200 /api/cockpit/state --cookie "$cookies"
perl -MJSON::PP -0777 -e '
  my $v = decode_json(<>);
  die "Invalid cockpit projection\n"
    unless $v->{schema_version} == 1 && $v->{workspace_id} eq "default"
      && ref($v->{agents}) eq "ARRAY" && ref($v->{totals}) eq "HASH";
' "$body"
request 200 /api/logout --request POST --cookie "$cookies"
request 401 /api/state --cookie "$cookies"

request 200 /
cmp --silent "$frontend_dir/index.html" "$body" || {
  echo 'Served root HTML differs from the packaged frontend' >&2
  exit 1
}
perl -0777 -ne '
  die "Packaged frontend has no built JavaScript entrypoint\n"
    unless /<script\b[^>]*src=["\x27]\/assets\/[^"\x27]+\.js["\x27]/;
' "$body"
asset_count=0
while IFS= read -r -d '' asset_file; do
  asset_path="${asset_file#"$frontend_dir"}"
  request 200 "$asset_path"
  cmp --silent "$asset_file" "$body" || {
    printf 'Served asset differs from packaged file: %s\n' "$asset_path" >&2
    exit 1
  }
  asset_count=$((asset_count + 1))
done < <(find "$frontend_dir/assets" -type f -print0)
[[ "$asset_count" -gt 0 ]] || {
  echo 'Packaged frontend contains no assets' >&2
  exit 1
}
request 200 /harnesses/antigravity.svg
served_svg_sha=$(sha256sum "$body" | cut -d ' ' -f 1)
[[ "$served_svg_sha" == "$SMOKE_EXPECTED_AGY_SHA256" ]] || {
  echo 'Served Antigravity SVG differs from the source artifact' >&2
  exit 1
}
agy_version=$(timeout 15s agy --version)
[[ -n "$agy_version" ]] || {
  echo 'Packaged Antigravity CLI returned an empty version' >&2
  exit 1
}
SMOKE_ASSET_COUNT="$asset_count" SMOKE_AGY_VERSION="$agy_version" \
  perl -MJSON::PP -e '
    print encode_json({architecture => "arm64", health => 200,
      unauthenticated_state => 401, invalid_login => 401, owner_login => 200,
      authenticated_state => 200, cockpit => 200, logout_revocation => 401,
      root_html_matches => JSON::PP::true, assets_verified => 0 + $ENV{SMOKE_ASSET_COUNT},
      antigravity_svg_sha256 => $ENV{SMOKE_EXPECTED_AGY_SHA256},
      agy_version => $ENV{SMOKE_AGY_VERSION}}), "\n";
  '
