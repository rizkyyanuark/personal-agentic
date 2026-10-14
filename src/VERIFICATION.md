# Verification

Run the static and package checks from `src`:

```powershell
cargo fmt --all --check
cargo test --workspace --locked
npm ci
npm run lint --workspace frontend
npm run check --workspace cockpit
npm run build
```

The browser smoke tests in `frontend/tests/native-smoke.mjs` exercise the running service. Start a disposable organization on a separate port, set `AE_TEST_ORG` and `AE_TEST_URL`, and run a phase such as `node tests/native-smoke.mjs basic` from `frontend`.

Some phases require a signed-in provider CLI or a configured SSH workstation and may use provider quota. Keep test organizations and evidence outside the repository; never commit credentials, private addresses, runtime state, screenshots, or production run records.

## Production release checks

Run the helper and CI deploy-client tests on Linux:

```sh
python3 -B infra/production/tests/release_test.py
python3 -B infra/ci/tests/deploy_test.py
bash -n infra/production/bootstrap.sh infra/ci/build-backend.sh infra/ci/publish-image.sh infra/ci/smoke-image.sh
sh -n infra/production/deploy-command.sh infra/ci/buildkit-runc.sh
```

The helper suite uses real HTTP transport faults, SQLite, private filesystem
journals and archive hashes. Destructive Docker operations are not run against
production by these tests. The deploy-client suite checks immutable release
identity, protected-main/freshness refusal, helper failure reporting and a real
HTTP health server; external Git/SSH boundaries are substituted for regression
cases that must not deploy production.

For application acceptance, use a disposable loopback candidate with separate
Linux data/workdir volumes, owned by its normal application user. Keep the owner
key private in an ignored host replica for test clients. Verify authenticated
state has no `maintenance` field, removed deployment-drain GET/POST return 404,
and normal UI chat/group actions persist. Seed an old sealed drain marker before
startup and verify it cannot block work. `frontend/tests/native-smoke.mjs basic`
includes the state/banner removal regressions; existing authorization and archived
read-only behavior must still hold.

Packaged native ARM64 image smoke runs on protected main and uses actual
SQLite/auth/UI/cockpit/asset paths. Local AMD64 acceptance does not establish
latest ARM64 CI, installed production helper or release activation. Record the
exact revision, proof and pending dependencies in [CI-003](../openspec/changes/archive/2026-10-14-CI-003-simple-automatic-releases/proposal.md).

## Organization Live Preview

Build the real service, then run `node frontend/tests/cockpit-live.mjs` from `src`
with `AE_TEST_URL`, `AE_TEST_OWNER_KEY` and optionally `AE_TEST_PROOF_DIR` set.
The owner key stays in the environment; do not put it in URLs or evidence files.
This uses the actual HTTP service, identity/organization databases, and browser.
It creates disposable workspaces and verifies the floating overlay, dimmed backdrop,
focus trap/return, close button/backdrop/toolbar Escape, original desk-camera card
selection, character-tag tracking and cockpit Escape/double-click reset. It also verifies read-only opening,
idempotent five-role setup, filter/reload, disconnect/recovery, repeated mounting,
workspace isolation and logout. Provider execution is a separate real-work check;
the UI smoke alone does not prove agent execution.

`node frontend/tests/cockpit-agent-run.mjs` exercises one actual Antigravity task
through the existing message API and observes its status in the browser. Use a
disposable candidate organization's default workspace, a signed-in CLI, and a
`/workdir/cockpit-smoke/SMOKE_INPUT.txt` fixture with exactly these two lines:

```text
Cockpit integration smoke
Read-only fixture second line
```

It requires an unconfigured Nova, selects the real advertised model, records the
native run/session and status trace, and restores the profile afterward. Set the
same test environment variables as the browser suite. It uses provider quota.

`node frontend/tests/cockpit-deployed.mjs` reads the configured default workspace
and verifies hierarchy, overlay/camera interactions, nine viewport sizes with
close/reopen cycles, the actual WebGL render, and unchanged profiles
and runs. Set `AE_TEST_ARRANGE_ORG=true` only when intentionally arranging the
organization cards through its existing Auto arrange control; default is read-only.

Both cockpit suites check the original presentation at 320×844,
390×844, 768×1000, 1024×1000, 1440×1000, 1848×930, 1280×720, 390×600, and 844×390.
They report toolbar/card heights, card-strip share of the host, and the canvas
area unobstructed by HUD hit testing. Set `AE_COCKPIT_REFERENCE` to the untouched
virtual-kantor source directory. The suite renders its original CSS in an isolated
reference document with the same live DOM and host dimensions, then compares 18
components' computed typography, spacing, grid, surfaces and corners. The older
compact-card limits no longer apply because the owner requested the original
design. The same canvas and selected camera must survive desktop → phone → desktop
resizing. The original mobile carousel and panel dock retain their behavior.

The browser checks also compare each identity badge with Organization `position`
and `Token diproses` with nullable persisted usage and reported/total run coverage.
They exercise the Refresh icon against Rust with normal and reduced motion.
The deployed suite additionally opens actual touch contexts at 390×600 and
844×390, checks 44 px toolbar controls, taps cards/tags/close, and opens the
landscape detail panel. Refresh rotation is sampled during busy rendered frames;
reduced motion must leave that rotation disabled while the HTTP request succeeds.
From `src`, with the private test environment already configured:

```powershell
node frontend/tests/cockpit-live.mjs
node frontend/tests/cockpit-deployed.mjs
```

Each command emits measured `layouts` in its final JSON and saves screenshots
under `AE_TEST_PROOF_DIR`. A deployed result is verified only after these commands
pass against that build; changes to test coverage alone are not deployed proof.

Previously on 6 October 2026, the compact build passed the main service smoke at port 18766:
9 viewport sizes, touch portrait/landscape, unchanged 7 profiles/2 runs, and no
new runs. Candidate, persisted native-token receipt, 87 Rust tests, and 199 cockpit
tests also passed. This correction reused the existing provider receipt and made
no new provider invocation. Exact measurements, screenshot paths, and logs are
recorded in [the integration result](../docs/cockpit-integration-result.md).

`docker build --target verification -f Dockerfile .` from `src` runs Rust format
and the complete Rust workspace tests with the actual ONNX Runtime library.
Use a separate candidate container/volume/port for job evidence before replacing
an existing preview. Keep that preview's data volume and save a stopped-service
backup before rollout; never remove it with `docker compose down -v`.

## Antigravity run documents

The Rust workspace tests include the authenticated document routes with real
SQLite and filesystem persistence: historical import, immutable preview after
source removal, retry repair, group lifecycle, provenance, and write permissions.
Platform-router coverage also exercises the real membership invitation API and
persisted-session authentication: an invited workspace owner cannot import or
export controller documents, while permitted saved previews remain readable.
The regression seeds a login record; it does not exercise external Matrix sign-in.
Run `python backend/tests/run_documents.py` from `src` on Linux for the SSH
transport checks. These use temporary files and actual directory descriptors;
no provider call or internal module mock is used. The `ssh_bridge` GitLab job
runs this suite alongside the existing Antigravity skill checks.

For product acceptance, use an isolated candidate organization containing a
historical Antigravity run and its published reply. Open the original document
link, choose **Recover document**, check the import-time label and source hash,
then restart with that candidate's SSH connection unavailable. The saved link
must still return the same bytes. A separate real Antigravity task that links a
Markdown file must attach a `completion` artifact before publishing its reply.
Check explicit export, existing-file rejection, read-only rejection, and that
neither flow adds Knowledge until the user requests it. Keep private run records,
owner keys, screenshots, and candidate state in an ignored proof directory.

## Antigravity SSH project pilot

`node frontend/tests/cockpit-ssh-pilot.mjs` invokes the configured real provider
over SSH. It uses the existing cockpit identities and project; it does not create
or edit profiles. Set private `AE_TEST_OWNER_KEY`, `AE_TEST_URL`,
`AE_TEST_PROOF_DIR`, `AE_TEST_GROUP_ID`, `AE_TEST_ORION_ID` and `AE_TEST_NOVA_ID`.
`AE_TEST_LYRA_ID` is optional when the Research Scientist slot is already mapped.

The configured project must contain `PROJECT_BRIEF.md`, `AGENTS.md` and
`EXPERIMENT_PLAN.md` (or exactly three safe relative Markdown paths in
`AE_TEST_DOCS`). Every tested profile must be enabled Antigravity and read-only,
with a validated SSH project workdir. The first stage directly mentions Nova,
requiring real reading events for all three documents and an actual successful
native receipt. The second mentions Orion, requiring one schema decision, one
Lyra delegate and one persisted summary. At most one provider turn may run at
once. The script records actual phases rather than inventing transient ones.

Its JSON proof contains run IDs, native/SSH receipt presence, safe activities,
token coverage, unchanged configuration hashes and screenshots. It stores no
owner key, raw tool output or private arguments. Cancellation on failure is
limited to the script's own jobs. Hash the remote documents before and after
independently: provider success and UI screenshots alone do not prove no edits.

Set `AE_TEST_STAGE=coordination` to exercise only the three Orion decision → Lyra
delegate → Orion summary turns when a direct audit has already been verified.
The default `full` mode retains the Nova audit and requires four turns. Both modes
verify actual SSH/native receipts, one active turn, reading activity, unchanged
profiles/project and a persisted summary resuming Orion's coordinator conversation.

## Antigravity SSH skills inventory

The production bridge's filesystem suite requires Linux with Python 3.11+, the
SSH execution environment. It exercises actual symlinks and FIFOs; native Windows
Python does not provide the same filesystem behavior. From `src` on Linux, run:

```sh
python3 -B backend/tests/antigravity_skills.py
```

With Docker configured for Linux containers, PowerShell users can run the same
suite using the official Python image and a read-only backend mount. From `src`:

```powershell
docker run --rm --mount "type=bind,source=$((Resolve-Path backend).Path),target=/backend,readonly" python:3.12-slim python -B /backend/tests/antigravity_skills.py
```

Rust format and workspace tests run on the supported host platforms:

```powershell
cargo fmt --all --check
cargo test --workspace --locked
```

The Python suite imports the production bridge and uses actual temporary files,
directories and symlinks. It covers direct-workdir scope, the legacy installation
path, empty installations, canonical-path deduplication, frontmatter framing,
size/count limits, UTF-8 and contained previews. Rust tests verify YAML metadata,
valid/invalid entries and rejection of previews absent from the valid catalog.
These checks require no provider prompt or installed Python YAML package; the
Rust service parses metadata with `serde_yaml_ng`.

Static checks and temporary fixtures do not prove the deployed product path.
With the candidate service running and a real Antigravity SSH agent such as
Galileo attached to its workdir, complete this read-only smoke:

1. Sign in through the normal owner login and open **Organization → agent →
   Skills**. Check the displayed workdir, list and errors against files installed
   directly in that workdir's `.agents/skills` and `.agent/skills`.
2. Filter by the installed skill's name and description, open its `SKILL.md`, go
   back to the list, and press **Refresh**. Verify the actual instruction preview
   and that the former unsupported-discovery warning is absent.
3. Check authenticated `GET /api/agents/{id}/skills` and the same endpoint with
   a URL-encoded `path` copied from the current catalog. Both must return HTTP
   200 with the real list or preview. A request without owner authentication
   must return HTTP 401. A forged or out-of-workdir preview path must return
   HTTP 400 without file contents.
4. Record screenshots and safe JSON evidence outside the repository. Confirm
   that profiles, project attachments and run counts are unchanged and that no
   provider run was created by discovery or preview.

The inventory excludes ancestor/global/plugin locations. Its aggregate limits
are 1024 directory entries, 256 candidate bundles and 2 MiB of frontmatter;
individual files allow 256 KiB and frontmatter 16 KiB. Per-file problems remain
visible in `SkillList.errors`; exceeding an aggregate limit must fail explicitly.
This smoke verifies installed-file discovery and preview, not native skill
activation. A provider run is separate evidence and may consume quota.


## SSH timeout regression

With the patched service running, choose an idle agent attached to a controller/SSH workdir. Inject `AE_TEST_KEY` from your existing secret source into the process environment; do not put the key in a command, file or committed configuration. From `src`, run:

```powershell
$env:AE_TEST_URL = 'http://<application-host>:<port>'
$env:AE_SOURCE_AGENT = '<existing-ssh-agent-id>'
python backend/tests/ssh-timeout.py
```

The script uses the source agent's harness, model, effective remote workdir and access mode. It creates its own agent, group and Action scheduled five seconds ahead. The real scheduler must dispatch a run that times out after ten seconds; the Action must become failed with the same timeout error. It also verifies explicit Stop and a successful short reply through chat, giving only the temporary agent a 60 second timeout for those two cases. After all runs finish, it soft-deletes its Action and agent and archives its group. JSON output records statuses, remote completion receipts and cleanup; no mocked providers are used. `AE_RUN_WAIT_SECONDS` optionally bounds each run, with a default of 120 seconds.

The timeout and Stop prompts permit only `sleep 30`; they prohibit repository edits and training. Access mode stays identical to the source, including Antigravity's read-only plan mode. If the provider refuses the operation or finishes before the deadline, the script reports a failure; that result does not prove timeout behavior. Organization instructions and repository instructions remain part of the real harness, so choose a suitable workdir and inspect any failed result.
