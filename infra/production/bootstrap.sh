#!/usr/bin/env bash
set -euo pipefail

fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ $EUID == 0 ]] || fail 'Run production bootstrap as root.'
[[ $# -le 1 ]] || fail 'Usage: bootstrap.sh [production-directory]'
production_root=$(realpath -e -- "${1:-/opt/personal-agentic}")
env_file="$production_root/production.env"
compose_file="$production_root/compose.yaml"
registry_config="$production_root/registry-auth"
[[ $(stat -c '%u:%a' "$production_root") == 0:700 ]] || fail 'The production directory must be root-owned with mode 0700.'

for dependency in docker python3 curl; do
  command -v "$dependency" >/dev/null || fail "Required command is unavailable: $dependency"
done
[[ -f "$env_file" && ! -L "$env_file" ]] || fail 'Create a root-owned production.env before bootstrap.'
[[ $(stat -c '%u:%a' "$env_file") == 0:600 ]] || fail 'production.env must be root-owned with mode 0600.'
[[ -d "$registry_config" && ! -L "$registry_config" ]] || fail 'Create the private registry-auth directory first.'
[[ $(stat -c '%u:%a' "$registry_config") == 0:700 ]] || fail 'registry-auth must be root-owned with mode 0700.'
[[ -f "$registry_config/config.json" && ! -L "$registry_config/config.json" ]] || fail 'Complete the private production registry login first.'
[[ $(stat -c '%u:%a' "$registry_config/config.json") == 0:600 ]] || fail 'Registry config.json must be root-owned with mode 0600.'
[[ -f "$compose_file" && ! -L "$compose_file" ]] || fail 'Production compose.yaml is missing.'
docker compose version >/dev/null
compose() {
  env -u AE_PLATFORM_IMAGE -u AE_PUBLIC_URL -u AE_MATRIX_SERVER_NAME \
    -u AE_MATRIX_BOT_USERNAME -u AE_MATRIX_BOT_PASSWORD -u AE_SSH_KEY_FILE \
    docker --config "$registry_config" compose --project-name personal-agentic-prod \
    --env-file "$env_file" --file "$compose_file" "$@"
}

settings=$(compose config --format json | python3 -c '
import json, re, sys
config = json.load(sys.stdin)
platform = config["services"]["platform"]
image = platform["image"]
if not re.fullmatch(r"registry\.tugasakhir\.space/rizkyyanuark/personal-agentic/platform@sha256:[0-9a-f]{64}", image):
    raise SystemExit("AE_PLATFORM_IMAGE must be a tested project registry digest.")
if platform["environment"]["AE_PUBLIC_URL"] != "https://agent.tugasakhir.space":
    raise SystemExit("AE_PUBLIC_URL must be https://agent.tugasakhir.space.")
username = platform["environment"]["AE_MATRIX_BOT_USERNAME"]
if not re.fullmatch(r"[a-z0-9._=-]+", username):
    raise SystemExit("Use a valid lowercase Matrix bridge localpart.")
if len(platform["environment"]["AE_MATRIX_BOT_PASSWORD"]) < 32:
    raise SystemExit("Use a newly generated Matrix bridge password of at least 32 characters.")
keys = [mount["source"] for mount in platform["volumes"] if mount.get("target") == "/run/ae-ssh/id_ed25519"]
if len(keys) != 1:
    raise SystemExit("Mount exactly the selected production runtime key.")
print(image)
print(keys[0])
')
mapfile -t settings_lines <<< "$settings"
runtime_key=$(realpath -e -- "${settings_lines[1]}")
[[ "$runtime_key" == "$production_root"/runtime-ssh/* ]] || fail 'Keep the selected runtime key inside the production runtime-ssh directory.'
[[ -f "$runtime_key" && ! -L "${settings_lines[1]}" ]] || fail 'The production runtime key must be a regular file.'
case $(stat -c '%u:%a' "$runtime_key") in
  10001:400|10001:600) ;;
  *) fail 'The runtime key must belong to UID 10001 with mode 0400 or 0600.' ;;
esac

printf '%s\n' 'Pulling the tested ARM64 image and the pinned Synapse version.'
compose pull
[[ $(docker --config "$registry_config" image inspect "${settings_lines[0]}" --format '{{.Architecture}}') == arm64 ]] \
  || fail 'The selected platform image must be native ARM64.'
if compose run --rm --no-deps --entrypoint python matrix -c \
  'import pathlib; raise SystemExit(0 if pathlib.Path("/data/homeserver.yaml").is_file() else 42)'; then
  printf '%s\n' 'Retaining the existing production Matrix configuration.'
else
  result=$?
  [[ $result == 42 ]] || fail 'Could not inspect the production Matrix volume.'
  compose run --rm --no-deps matrix generate
fi

compose run --rm --no-deps --entrypoint python matrix -c '
import os, pathlib, yaml
path = pathlib.Path("/data/homeserver.yaml")
config = yaml.safe_load(path.read_text())
if config.get("server_name") != os.environ["SYNAPSE_SERVER_NAME"]:
    raise SystemExit("The configured Matrix server name differs from its persisted identity.")
if "rc_login" not in config:
    config["rc_login"] = dict(address=dict(per_second=1, burst_count=100), account=dict(per_second=0.2, burst_count=10), failed_attempts=dict(per_second=0.17, burst_count=3))
    path.write_text(yaml.safe_dump(config))
'
compose up -d --no-build matrix
matrix_ready=false
for attempt in $(seq 1 45); do
  if compose exec -T matrix python -c \
    'import urllib.request; urllib.request.urlopen("http://localhost:8008/_matrix/client/versions", timeout=2).close()' >/dev/null 2>&1; then
    matrix_ready=true
    break
  fi
  sleep 2
done
[[ $matrix_ready == true ]] || fail 'Matrix did not become ready; inspect production Matrix logs.'

compose exec -T matrix python -c '
import hashlib, hmac, json, os, urllib.error, urllib.request, yaml
base = "http://localhost:8008"
username = os.environ["AE_MATRIX_BOT_USERNAME"]
password = os.environ["AE_MATRIX_BOT_PASSWORD"]
config = yaml.safe_load(open("/data/homeserver.yaml"))
def request(path, body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = None if body is None else json.dumps(body).encode()
    with urllib.request.urlopen(urllib.request.Request(base + path, data=data, headers=headers), timeout=10) as response:
        raw = response.read()
        return json.loads(raw) if raw else {}
nonce = request("/_synapse/admin/v1/register")["nonce"]
mac = hmac.new(config["registration_shared_secret"].encode(), "\0".join([nonce, username, password, "notadmin"]).encode(), hashlib.sha1).hexdigest()
try:
    registration = request("/_synapse/admin/v1/register", dict(nonce=nonce, username=username, password=password, admin=False, mac=mac))
    if registration.get("access_token"):
        request("/_matrix/client/v3/logout", {}, registration["access_token"])
except urllib.error.HTTPError as error:
    try:
        code = json.load(error).get("errcode")
    except (ValueError, AttributeError):
        raise SystemExit("Matrix bridge registration returned an invalid error response.") from None
    if code != "M_USER_IN_USE":
        raise SystemExit("Matrix bridge registration failed (HTTP %s)." % error.code) from None
try:
    login = request("/_matrix/client/v3/login", dict(type="m.login.password", identifier=dict(type="m.id.user", user=username), password=password, initial_device_display_name="Production bootstrap verification"))
except urllib.error.HTTPError as error:
    raise SystemExit("Matrix bridge login failed (HTTP %s); verify the production password without resetting existing accounts." % error.code) from None
expected_user = "@" + username + ":" + config["server_name"]
if login.get("user_id") != expected_user or not login.get("access_token"):
    raise SystemExit("Matrix bridge login did not return the expected production identity.")
request("/_matrix/client/v3/logout", {}, login["access_token"])
print("Production Matrix bridge registration and password login verified.")
'

compose up -d --no-build platform
platform_ready=false
for attempt in $(seq 1 45); do
  if curl --fail --silent --max-time 3 -H 'Host: agent.tugasakhir.space' \
    http://127.0.0.1:18766/api/health >/dev/null; then
    platform_ready=true
    break
  fi
  sleep 2
done
[[ $platform_ready == true ]] || fail 'The production controller did not become healthy; inspect its logs.'
printf '%s\n' 'Production bootstrap completed; private controller health returned HTTP 200.'
printf '%s\n' 'Retrieve the new owner key privately from /data/org/.state/owner.key in the production platform container.'
