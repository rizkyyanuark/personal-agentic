# Decentralized workspaces

The controller stores organizations, room history, schedules and run evidence. Each
workspace has a separate organization database, sessions, files and agent hierarchy.
Workers connect outbound, own their native CLI login and workdir, and register with
one workspace. No inbound SSH server is needed for a registered worker.

## Install

For a controller that executes through an SSH workstation, expose only its
selected private key to the platform container as a read-only bind mount. From
`src`, set `AE_SSH_KEY_FILE` to that absolute host filename and include
`compose.ssh.example.yaml` with the normal compose files. Keep the variable in
local configuration, not Git. Configure the workstation with container key path
`/run/ae-ssh/mini-project-key.pem`, and verify its host-key fingerprints through
an already trusted connection before accepting them in Workstations. Provider
authentication remains on the remote host.


Native installers build the checked-out source using the committed Cargo/npm lockfiles.
They are source installers, so the first build requires several GB of disk and RAM.
Linux x64/ARM64, Apple Silicon and Windows x64 include ONNX Runtime for knowledge
indexing. Intel macOS workers run natively; controller knowledge indexing needs a
manually supplied ONNX 1.24.4 library or Docker because upstream has no Intel Mac binary.
Source installation remains available from a reviewed checkout of this project.
Authenticate Git access to the canonical GitLab repository first. Use `AE_REF` to
select a reviewed commit/ref; source installation clones/builds into its own
installation directory and refuses to discard changes there.

Windows (PowerShell 7, Git, Node 22+, Rust 1.94+, Visual Studio C++ Build Tools):

```powershell
pwsh -NoProfile -File src/install.ps1 -Source
```

Linux Debian/Ubuntu or macOS with Homebrew/Xcode command-line tools:

```sh
AE_INSTALL_MODE=source bash src/install.sh
```

Docker (Docker Compose, Git, OpenSSL; builds on this device):

```sh
bash src/install-docker.sh
```

The Docker installer provisions Synapse, a private bridge identity and the platform.
Default ports are loopback-only: platform `18766`, Matrix `18767`. Change ports through
`AE_PORT` / `AE_MATRIX_PORT` and set the exact browser origin in `AE_PUBLIC_URL`.
For access outside a trusted private network, terminate HTTPS at your reverse proxy;
do not expose an unencrypted public listener. Forward Host unchanged. `AE_INTERNAL_URL`
is the explicitly trusted Docker service address, not a forwarded-header wildcard.

The first owner signs in with `/data/org/.state/owner.key` (native: `org/.state/owner.key`).
Retrieve it locally with `docker compose exec platform cat /data/org/.state/owner.key`.
Keep this bootstrap key private. It retains the original organization's local/SSH access.
New workspaces only execute through their registered runtimes.

## People and Matrix

Configure an existing homeserver with `AE_MATRIX_HOMESERVER`, `AE_MATRIX_BOT_USERNAME`
and `AE_MATRIX_BOT_PASSWORD`, or use the bundled Synapse. To create a human account on
the bundled server, run the interactive command:

```sh
docker compose exec matrix register_new_matrix_user -c /data/homeserver.yaml http://localhost:8008
```

Humans sign in with Matrix credentials. The platform issues an expiring, server-side,
revocable session in an HttpOnly/SameSite cookie; it does not store human passwords.
Create/rename/delete/restore workspaces and invite Matrix IDs in **Manage workspaces**.
Each workspace has an owner and members. Owners administer it; members can read and
post in invited rooms. Revocation is checked on every HTTP request. Deletion retains
history, disables dispatch and rejects access until an owner restores it.

Groups invite people and agents. Selecting an agent includes its reporting ancestors;
the UI expands a selected manager's descendants and lets you remove individual branches.
Excluded branches cannot receive delegated work. Projects retain their own custom hierarchy.
Legacy level-based groups remain readable and are converted to explicit members when saved.

Ordinary messages do not run agents. Use the **@** picker or complete `@name` / `@id`
mentions; `@all` addresses enabled participants (maximum eight per message). Scheduled
work must explicitly mention an agent; old schedules without a target pause with an error.
The automatic chat-lead controls have been removed.

The `matrix-sdk` 0.18 client creates private rooms, reconciles human membership, imports
native Matrix text events, and publishes platform main-room messages and agent replies.
The bridge labels the originating human/agent in Matrix; it does not impersonate native
Matrix users. Matrix event IDs and transaction IDs prevent duplicate delivery. The platform
checks tenant and group authorization before a Matrix event can invoke an agent.
Side chats and file attachments currently remain in the platform; this is a text-room bridge.
Rooms are not end-to-end encrypted: the trusted homeserver and agent bridge can read their
content. Do not enable room encryption in another client; encrypted events are not supported.

## Register a runtime

### Guided prebuilt worker setup

Windows x64 and Linux ARM64 can use the guided worker installer when the controller
has a complete compatible worker release configured. This installs only the
worker binary and its required runtime libraries, not a controller, frontend,
Matrix server, source checkout, Rust, or a C++ toolchain. Harness installation and
provider login are separate; a worker without them can be Online but cannot run
an agent. Setup never sends a provider prompt or changes project assignments.
Git must be installed before attaching/probing project workdirs; root browsing and
worker connection do not prove repository tooling or provider authentication.

1. Select the workspace in **User settings → Runtime**, then register a runtime.
2. In **Connect your worker**, set the reachable controller origin and select the
   device platform. A localhost URL works only on the controller machine.
3. Download the installer through the signed-in UI and transfer it to the device.
   Review the script before running it. The copied command contains no token.
4. Run the script in the device terminal, enter the enrollment token at its hidden
   prompt, and select the absolute project folder. Folder creation requires approval.
5. The installer downloads/verifies the package, enrolls, starts the managed worker,
   and waits for a new controller heartbeat. Refresh Runtime to see **Online**.

PowerShell 7 on Windows x64:

```powershell
pwsh -NoProfile -File ./setup-worker.ps1 -Controller 'https://controller.example'
```

If Windows blocks a downloaded script, review it first and unblock only that file
with `Unblock-File ./setup-worker.ps1`; do not weaken machine-wide execution policy.

Linux ARM64, with Bash, curl, jq, unzip/zipinfo, coreutils, a systemd user session,
glibc 2.36+ and OpenSSL 3 runtime libraries:

```sh
AE_CONTROLLER_URL='https://controller.example' bash ./setup-worker.sh
```

The Windows package bundles the x64 `vcruntime140.dll` redistributable used by
the build; Universal CRT and normal Windows system DLLs are OS prerequisites
(Windows 10/11 x64). It does not bundle a Visual Studio installation.

No global source build occurs. For automation use `AE_CONTROLLER_URL`,
`AE_ENROLLMENT_TOKEN`, `AE_WORKDIR`, and optional `AE_INSTALL_DIR`; supply the token
through a secret environment mechanism rather than typing it into shell history.
Windows automation also accepts `-Controller`, `-Workdir`, and `-InstallDir`.
Keep registration state private. Remote HTTP is rejected; loopback HTTP is allowed
for development. TLS validation is never disabled. DNS/VPN/firewall/host allowlists
must already permit the controller. Normal setup adds no resource quotas or users.

The Linux user service restarts independently of the installer; startup before
login requires an administrator-approved `loginctl enable-linger USER`. Windows
uses a per-user Scheduled Task triggered at logon; it starts immediately at setup.
Existing registrations are reused on reruns. Revoked or incompatible registration
replacement requires confirmation (`AE_REPLACE_REGISTRATION=1` or Windows
`-ReplaceRegistration` for explicit automation). Previous state and project files
are retained. Customized/unowned services are not silently replaced. Use a new
install directory rather than taking over a manual system service.

Enrolled, service started and Online are separate outcomes. A 60-second Online
timeout preserves state and prints diagnostics; rerun setup to verify/reconnect,
not Register runtime again. Get a fresh token if enrollment expires after 15 minutes.
Verified archive cache is reused. No native process stopping is implied by UI Revoke.

### Controller package inventory and release

Package delivery is disabled until an operator configures one trusted inventory.
Set `AE_WORKER_PACKAGE_URL` to a pinned HTTPS GitLab Generic Package directory:
`https://gitlab.example/api/v4/projects/PROJECT_ID/packages/generic/worker/FULL_COMMIT/`.
Use optional `AE_WORKER_PACKAGE_TOKEN_FILE` for a server-side read-only package
credential. It is never returned to devices or replaced by their enrollment tokens.
No redirects, client-selected repository URLs, or arbitrary paths are fetched.
For local acceptance/offline inventories use `AE_WORKER_PACKAGE_DIR` pointing to
an operator-owned directory with the same four files. Do not put secrets in it.

The inventory contains `windows-x64.json`, `linux-arm64.json`,
`worker-windows-x64.zip`, and `worker-linux-arm64.zip`, with matching immutable
40-character source release IDs, protocol 1, SHA-256, compressed sizes and per-file
checksums/sizes. Both manifests must be present before either target is offered.
Archives are bounded to 128 MiB; total expanded package data is bounded to 768 MiB.
Checksums are authenticated through trusted HTTPS/controller metadata, not code signing.

Installer package requests use `Authorization: Bearer TOKEN` against
`GET /api/runtime/packages/{windows-x64|linux-arm64}/{manifest|archive}`. A valid
unconsumed enrollment token permits download without consuming registration, or
an existing worker token permits repair. Expired/revoked tokens are rejected.
`GET /api/runtime/status` requires the saved worker credential and returns only
its own identity, workspace, OS/root, Online, last_seen and heartbeat sequence.
It never changes heartbeat or claims queued jobs. Installers require a new
heartbeat after starting their service. Old controllers without these routes are
incompatible with guided setup; retain source/direct-run mode or upgrade first.

Release CI is explicitly selected with `AE_WORKER_RELEASE=1` on protected main.
Worker packaging waits for the existing production stages to complete. Linux uses
`dependencies` to retrieve the backend artifact without bypassing stage order; a
missing Windows executor or a packaging failure cannot hold up production deploy.
It reuses the backend ARM64 artifact, builds Windows on a runner tagged
`worker-windows-x64`, and publishes only the complete verified pair using the
CI job token. The Windows runner must provide PowerShell 7, Python 3.11+, Rust,
Visual Studio C++ build tools and protoc on PATH. No Windows runner is provisioned
by these scripts. Do not advertise release availability before that executor and
clean-target acceptance are established. Normal production image/deploy jobs keep
their existing rules and dependencies.

Local packaging from compiled outputs (build machine only):

```sh
python infra/ci/worker_packages.py --binary PATH_TO_BINARY --platform linux-arm64 --release FULL_COMMIT --output worker-packages
# Use --platform windows-x64 for a real Windows x64 executable;
# add --library PATH_TO_DLL only for runtime DLLs actually needed by worker mode.
```

Package publication/CI triggering is separate from local implementation/testing.
Rollback selects the previous immutable inventory and compatible installed version;
retain `installation.previous.json` and the prior service/task export. Review the
saved registration before switching: rollback must not revoke/re-enroll, delete
project/session data, or replay commands automatically.

For an installer-owned Windows task, restore only a previous configuration using
the same controller, root and registration state. A state change needs an explicit
recovery decision rather than blindly restoring an older identity:

```powershell
$homeDir = Join-Path $env:LOCALAPPDATA 'AgenticWorker'
$current = Get-Content -Raw "$homeDir/installation.json" | ConvertFrom-Json
$previous = Get-Content -Raw "$homeDir/installation.previous.json" | ConvertFrom-Json
if ($current.state -ne $previous.state -or $current.root -ne $previous.root -or $current.controller -ne $previous.controller) { throw 'Review incompatible registration/root before rollback' }
Stop-ScheduledTask -TaskName $current.task
$deadline = [DateTime]::UtcNow.AddSeconds(15)
do {
    try {
        $lock = [IO.File]::Open((Join-Path $current.state 'worker.lock'), [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
        $lock.Dispose()
        break
    } catch [IO.IOException] {
        if ([DateTime]::UtcNow -gt $deadline) { throw 'Previous worker has not stopped; leave configuration unchanged' }
        Start-Sleep -Milliseconds 200
    }
} while ($true)
Register-ScheduledTask -TaskName $previous.task -Xml (Get-Content -Raw "$homeDir/task.previous.xml") -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -Force
Copy-Item "$homeDir/installation.previous.json" "$homeDir/installation.json" -Force
Start-ScheduledTask -TaskName $previous.task
```

For Linux, apply the same controller/root/state compatibility check to
`installation.previous.json`, restore `service.previous` to the named user unit,
restore the matching metadata, then run `systemctl --user daemon-reload` and
`systemctl --user restart SERVICE`. Recheck `/api/runtime/status` with the saved
worker credential without printing it; require a new heartbeat and the expected
identity/root. Keep both versions until that check succeeds.

### Explicit source, direct-run and Docker alternatives

The commands below describe the existing source/direct paths. The source checkout
must be this project (default GitLab URL, overridable with `AE_SOURCE_REPO`), with
normal Git authentication configured. Native `install.sh --worker` or setting
`AE_CONTROLLER_URL` selects prebuilt mode; set `AE_INSTALL_MODE=source` explicitly
to retain the source-build path. Windows `install.ps1 -Worker` selects prebuilt;
`-Source` retains source build. Linux x64/macOS use source mode for now. Source
prerequisites and builds are still substantial and do not imply prebuilt coverage.

Docker remains an explicit build-on-device alternative through
`install-docker.sh`/`compose.worker.yaml`; persist `/data` and the chosen workdir.
No implicit switch from prebuilt setup to Docker/source build is performed.

1. Sign in to the native Codex or OpenCode CLI on the worker machine. Refresh its model
   catalog using the native CLI. Provider credentials are never uploaded to the controller.
2. In **User settings → Persistent runtimes**, register a runtime. Copy the one-use token
   (expires after 15 minutes).
3. Set `AE_ENROLLMENT_TOKEN` and `AE_CONTROLLER_URL` on the worker. Run:

```sh
agentic-enterprise --worker --worker-state /private/worker-state --worker-root /absolute/workdir
```

Both Windows and Unix support the same flags (use an absolute Windows workdir on Windows).
After first enrollment the persistent registration is reused; the enrollment token is not
needed again. `--enroll-only` registers without starting the polling loop. Running the native
installer with `AE_CONTROLLER_URL` set also installs a Windows scheduled task, Linux user
systemd service, or macOS LaunchAgent. Linux users can enable lingering for pre-login startup.

Choose the registered runtime and absolute workdir in the agent/project settings. Validation
runs on that worker and checks canonical path identity and containment in its declared root.
The controller does not need a local CLI or provider credentials. Runtime revocation prevents
further claims and cancels its outstanding jobs.

For Docker, set the enrollment token in `.env` and run `docker compose --profile worker up -d --build worker`.
That command adds a worker beside the bundled controller. On a separate runtime machine,
export `AE_CONTROLLER_URL` and `AE_ENROLLMENT_TOKEN` before the Docker one-line installer.
It uses `compose.worker.yaml` and starts only the worker. `AE_WORKDIR` optionally selects
an absolute host directory; otherwise a named workdir volume is used. `AE_CODEX_HOME`
optionally selects a dedicated signed-in Codex directory. Without it, credentials live in
a named volume; complete native sign-in with the command printed by the installer.
The worker sends outbound requests to the exact existing platform URL; expose that
controller through the documented private-network/HTTPS configuration first.

The worker image includes Codex; custom images can add other native harness executables.
Its scoped seccomp profile retains Docker filtering while allowing unprivileged namespace
and mount operations needed by Codex bubblewrap. It does not grant host capabilities,
privileged mode, or override the agent's read-only/workspace-write permission. This follows
the [documented nested sandbox requirement](https://learn.chatgpt.com/docs/agent-approvals-security).
Persist `/data` for registration, sessions and the result outbox. Native CLI credentials must
be available inside the worker user's home (`/home/agent/.codex` for Codex). Use a dedicated
credential directory for this runtime; do not mount your entire home directory.

Workdir storage defaults to a named Docker volume. To use a host directory instead, add:

```yaml
# compose.override.yaml
services:
  worker:
    volumes:
      - /absolute/host/project:/workdir
      - /absolute/dedicated/codex-home:/home/agent/.codex
```

Use the container path `/workdir` when attaching it in the platform. The non-root worker
UID is `10001`; grant it access to the selected paths. Each worker registration belongs to
one workspace; use separate worker state directories/containers for different workspaces.

### Explicit local projects overlay

To grant the platform and an optional worker service access to existing host projects (such as repositories under `C:/Users/rizky/Documents/GitHub`), use the opt-in overlay `src/compose.projects.local.yaml`.

On Windows, start this setup through `node scripts/local-projects-compose.mjs`
from `src`. This required entrypoint checks the source directory before any Docker
call, requires an explicit project name, and uses only the local Docker Desktop
Linux named pipe. Keep `create_host_path: false` in the overlay: Docker documents
that option as preventing missing source creation in its [Compose services reference](https://docs.docker.com/reference/compose-file/services/).
Local acceptance on Docker Desktop Compose 5.6.0 nevertheless created a missing
Windows source and started the service despite rendering that option correctly.
The entrypoint's filesystem preflight protects this documented setup from that
observed behavior; direct `docker compose` startup bypasses the check.

Configuration example:
```sh
# Export in the shell before setup (keep machine-specific paths out of Git)
AE_PROJECTS_DIR="C:/Users/rizky/Documents/GitHub"
```

Use a dedicated Compose project so its platform, Matrix, and worker state are
separate from existing `/workdir` installations. From `src`, choose unused
loopback ports and a new project name. Do not reuse an enrolled worker's state.
For the first setup, choose a new Matrix bridge password through the masked prompt
and retain it in your private local configuration for later starts. Do not print
or commit that configuration:

```powershell
$env:AE_PROJECTS_DIR = 'C:/Users/rizky/Documents/GitHub'
$env:AE_PORT = '18866'
$env:AE_MATRIX_PORT = '18867'
$env:AE_PUBLIC_URL = 'http://127.0.0.1:18866'
$env:AE_MATRIX_SERVER_NAME = 'agentic-projects.local'
$env:AE_MATRIX_BOT_USERNAME = 'agentic'
$bridgePassword = Read-Host 'New project Matrix bridge password' -AsSecureString
$env:AE_MATRIX_BOT_PASSWORD = [System.Net.NetworkCredential]::new('', $bridgePassword).Password
$projectArgs = @('-p', 'agentic-projects-local')
node scripts/local-projects-compose.mjs @projectArgs config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Project configuration is invalid' }
node scripts/local-projects-compose.mjs @projectArgs run --rm matrix generate
if ($LASTEXITCODE -ne 0) { throw 'Synapse configuration generation failed' }
node scripts/local-projects-compose.mjs @projectArgs up -d matrix
if ($LASTEXITCODE -ne 0) { throw 'Synapse startup failed' }
```

These commands initialize this project's new `matrix-data` volume. Wait for that
homeserver, then create its private bridge account before starting the platform:

```powershell
$matrixReady = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  node scripts/local-projects-compose.mjs @projectArgs exec -T matrix python -c 'import urllib.request; urllib.request.urlopen("http://localhost:8008/_matrix/client/versions", timeout=3).close()' *> $null
  if ($LASTEXITCODE -eq 0) { $matrixReady = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $matrixReady) { throw 'The project homeserver is not ready' }
$registerBridge = @'
import hashlib, hmac, json, sys, urllib.request, yaml
account = json.load(sys.stdin)
config = yaml.safe_load(open('/data/homeserver.yaml'))
url = 'http://localhost:8008/_synapse/admin/v1/register'
nonce = json.load(urllib.request.urlopen(url, timeout=5))['nonce']
message = '\0'.join([nonce, account['username'], account['password'], 'notadmin'])
mac = hmac.new(config['registration_shared_secret'].encode(), message.encode(), hashlib.sha1).hexdigest()
payload = dict(nonce=nonce, username=account['username'], password=account['password'], admin=False, mac=mac)
request = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
urllib.request.urlopen(request, timeout=10).close()
'@
@{ username = $env:AE_MATRIX_BOT_USERNAME; password = $env:AE_MATRIX_BOT_PASSWORD } |
  ConvertTo-Json -Compress |
  node scripts/local-projects-compose.mjs @projectArgs exec -T matrix python -c $registerBridge
if ($LASTEXITCODE -ne 0) { throw 'Bridge account provisioning failed; do not change an existing account password implicitly' }
Remove-Variable bridgePassword, registerBridge
node scripts/local-projects-compose.mjs @projectArgs up -d --build platform
if ($LASTEXITCODE -ne 0) { throw 'Platform startup failed' }
```

Account provisioning is a first-start operation. To resume an initialized project,
load its same private settings and use `up -d` without repeating account creation.
Use the same entrypoint and `@projectArgs` for subsequent commands, including
owner-key retrieval and human-account registration, so they address this project's state.

The worker is optional and remains behind its existing Compose profile. Create
an enrollment for this new workspace through Runtime settings, provide its token
through the private `AE_ENROLLMENT_TOKEN` environment setting, then explicitly
start this project's worker:

```powershell
node scripts/local-projects-compose.mjs @projectArgs --profile worker up -d worker
node scripts/local-projects-compose.mjs @projectArgs --profile worker stop
```

`stop` preserves all data and registration. Ordinary operation does not need
volume deletion. To resume, use the same project name, ports, private configuration,
and `up -d` commands. Do not apply this overlay to an existing enrolled `/workdir`
worker. For automated acceptance with temporary state, use the isolated verifier
in [VERIFICATION.md](VERIFICATION.md#local-projects-overlay-verification).

Key operational policies:
- The overlay mounts `${AE_PROJECTS_DIR}` to `/projects` with `bind.create_host_path: false` on both platform and worker; the required Windows entrypoint separately rejects missing source directories before invoking Docker.
- The worker command is configured with `--worker-root /projects` so agent bindings under `/projects` are validated against this containment root.
- Root-switch implications: Existing registered workers bound to `/workdir` must not have their root switched abruptly; changing an enrolled worker root invalidates old path bindings. Use a separate registered worker or dedicated workspace.
- Linux credential boundary: Host Windows credentials and Git configurations do not transfer into Linux containers. Configure needed Git identities and keys inside the container/worker environment.
- Backup ownership: Files mounted from external host directories are owned and backed up by the host; platform organization backups do not bundle external project source trees.
- Containment: Only access approved project subdirectories within the mounted root; do not mount user home roots or unrelated host directories.
- Safe fixture cleanup: Temporary test fixtures created inside mounted paths must be cleaned up explicitly after tests.

## Failure and recovery contract

Claims and ordered output frames are durable. Workers retain an acknowledged result outbox
and native session state across restarts; retries resend results, never execute commands twice.
The controller uses its existing harness parser, queue conflicts, timeout/cancellation, question
handling and scoped MCP capabilities. The worker validates paths and owns the CLI process tree.
Loss of controller contact for 60 seconds stops owned work; a controller restart interrupts runs.
Inspect the saved workdir before explicitly retrying an interrupted task. A worker restart can
resume the saved native conversation on a subsequent, explicit message.

Install workers as managed services or containers: their process group/container is the crash
boundary. A hard kill of an unmanaged Unix foreground worker cannot guarantee descendant cleanup.
No transparent live migration or automatic command replay is provided.

The first version uses one controller process and SQLite per workspace. It is not a clustered
controller. Native terminal/file-browser operations remain available on the original local/SSH
workspace; registered workers currently expose harness execution and workdir validation.

## Verification

```sh
cd src
cargo test --locked --bin agentic-enterprise --no-fail-fast
npm ci
npm run lint --workspace frontend
npm run build
```

Run `scripts/verify-decentralized.py --help` for the real HTTP/Matrix/worker smoke test.
It requires a running controller, two real Matrix test identities and an enrolled runtime.
No provider or Matrix mocks are used.
