# Verification

## Worker onboarding

For installer error regression on Windows, set `AE_TEST_BINARY` to a real built
controller executable, `AE_TEST_OUTPUT` to a private ignored directory, and
`AE_TEST_PWSH` to PowerShell 7. Run
`python -B src/backend/tests/worker_installer_errors.py` from the repository root.
It launches a real loopback controller/SQLite, renders production Compose using the
Docker CLI without starting Docker, and checks invalid/expired credential 401
versus valid-credential/package-unavailable 503. Windows executes the installer;
Git Bash executes the exact Linux package HTTP function, not its systemd lifecycle.
No enrollment, production access, provider invocation or agent run is performed.


Use a disposable local controller, workspace, runtime state and project folder.
Do not use production, Yunesa, cloud runners or agent tasks for acceptance, and do
not copy provider credentials or invoke providers. Build/package on the development machine; test install without a
compiler on the target. Configure a complete two-platform local package directory
with `AE_WORKER_PACKAGE_DIR`. A package generated from a header fixture is only a
contract test, never native executable or Online proof.

Worker catalog discovery uses owned subprocesses with a five-second deadline per optional CLI and a 1 MiB output limit. A stalled or oversized catalog is reported unavailable without claiming authentication or delaying worker polling indefinitely. Run `cargo test --workspace --locked worker_catalog -- --test-threads=1` alongside the onboarding tests. For real worker acceptance, sample fresh heartbeat and directory responses across at least one 60-second catalog refresh; preserve any startup timeout separately from later recovery. These probes query model metadata only and must never submit an agent task.

Run package contract tests with `python -B infra/ci/tests/worker_packages_test.py`
from the repository root and backend checks with
`cargo test --workspace --locked worker_onboarding` from `src`. Use real native
Windows x64 and a local Linux ARM64 VM/emulator for service acceptance. Record the
emulator/platform and do not label missing service-manager coverage as passed.

Required proof: UI Register, hidden token setup, real service startup, fresh worker
heartbeat, UI Online, root browsing, denied outside-root access, no-harness catalog,
token-free restart, controller interruption/recovery, revoked replacement with
preserved state, expired/used token failure, unavailable package/architecture,
tampered archive/file hashes and no secrets in logs or service/task configuration.
Read-only self-status must leave `last_seen`, heartbeat and queued job state intact;
only the genuine worker poll produces the new heartbeat. Record zero agent runs.
Preserve prior agent/project bindings and existing local stack state.

Keep screenshots and receipts in ignored `.state` paths. Publish or provision CI
executors only after separate authorization; local recipe validation is not proof
that the Windows release executor exists or that packages were published.

For the Runtime UI origin/command regression, start a disposable controller on a
loopback URL and set `AE_TEST_URL`, `AE_TEST_ORG` (its organization directory),
and `AE_TEST_OUTPUT` (an ignored evidence directory). From `src`, run
`node frontend/tests/worker-onboarding.mjs`. It uses installed Chrome and real
login/Register/revoke APIs, verifies masked enrollment and safe token-free
commands, and rejects shell metacharacters, remote HTTP and credential-bearing
URLs. It creates no agent task and revokes only its own unused registration.

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

## Action feedback

Explicit management actions must show one top-right result toast even when the
editor remains open. Outcome prose (success, warning, error) appears once in the
active workspace top-right toast and is not repeated inline as duplicate
paragraphs or announced twice via assistive technology. Pending and Saved control
states remain in place.

Dismissing the toast retains separate diagnostic details, validation hints, draft
state, and recovery controls. Contextual validation (such as workdir probe errors,
folder browsing failures, field validation, or catalog unavailability) remains
near the affected fields and does not emit mutation toasts. Workdir attachment
explicitly separates probe validation from persistence: an invalid folder probe
yields zero profile writes and no irrelevant saved-profile or post-save-refresh
controls, while ambiguous writes preserve draft reconciliation and acknowledged
writes followed by failed reads offer read-only refresh without repeating PUTs.

Selected-workspace management operations (create, rename, invite, role change,
remove, delete, restore) run through the scoped workspace provider without
introducing a second toast viewport, and suppress stale notifications upon
workspace switch or logout. Chat message acceptance and attachment feedback remain
contextual; passive refresh does not emit mutation toasts. Sensitive actions (such
as token copying) display safe operation context without exposing credentials,
retaining dedicated masked inputs and manual copy buttons.

The suite records `feedback-agent-saved-top-right-toast.png` and toast bounds in
its proof JSON.

Build the candidate frontend with `npm run check` from `src`, then serve it through
the real application on a separate loopback port with disposable data, home and
workdir. The backend must match the candidate source revision; a frontend-only
change can reuse that exact backend image with its static frontend mounted read-only.
Do not run these mutations or filesystem faults against production.

From `src/frontend`, set `AE_TEST_ORG`, `AE_TEST_URL`, and
`AE_TEST_DISPOSABLE=true`. On Linux, also set `AE_TEST_BROWSER_EXECUTABLE` to the
installed Chromium executable. The existing smoke runner reads only the candidate's
owner key from `AE_TEST_ORG/.state/owner.key` and signs in through the real login API.

```sh
node tests/native-smoke.mjs action-feedback-core
node tests/native-smoke.mjs action-feedback
# Focused retries use the same real candidate and authentication:
node tests/native-smoke.mjs action-feedback-settings
node tests/native-smoke.mjs action-feedback-operations
node tests/native-smoke.mjs action-feedback-operations-core
node tests/native-smoke.mjs action-feedback-existing
node tests/native-smoke.mjs action-feedback-accessibility
node tests/native-smoke.mjs action-feedback-review
```

The core phase creates an unattached agent, checks real profile persistence and
revision guards, script writes, fast/delayed save feedback, duplicate suppression,
draft retention, historical revision restoration (including legacy instructions),
panel close/reopen, read-only refresh recovery, delayed snapshots, and chat request
deduplication. A new attachment added during a pending send must remain unsent;
a delayed side-chat response must not navigate away from a newly selected view.
It submits no provider prompt. Transport faults are explicit: delay a genuine request, abort a
follow-up read, or discard a response after forwarding the real save. A temporary
directory collision at that test agent's `profile.json` proves an actual HTTP 400
after the database commit; the fixture is restored in `finally`. This is not a
mocked backend response and does not prove atomic database/file materialization.

The full phase also verifies group/project lifecycle, SSH import/save/test/host-key
review/trust/removal, runtime registration/edit/revocation, knowledge upload and
indexing, schedules, action dispatch/cancellation, and feedback accessibility.
Supply `AE_TEST_WORKSTATION_ID`, `AE_TEST_KEY_WORKSTATION_ID`,
`AE_TEST_SSH_ALIAS`, and `AE_TEST_WORKDIR` for real disposable SSH fixtures.
Supply `AE_TEST_ACTION_RUN_AGENT` for a dedicated enabled Antigravity agent with a
read-only disposable SSH workdir and an actual signed-in model catalog. The action
case uses provider quota and cancels only its own run; schedules are set in the
future so they cannot launch unrelated work. The `action-feedback-operations-core`
target verifies operations lifecycle with zero provider runs (`noProvider: true`),
while the full `action-feedback-operations` target strictly requires
`AE_TEST_ACTION_RUN_AGENT` and fails explicitly if the fixture is missing.
Registration CRUD does not require a connected worker and does not prove worker execution.

The existing-feedback regression also uses one actual Antigravity reply linking
a deliberately missing Markdown file in the disposable SSH workdir. It verifies
the real failed capture, explicit recovery after creating that fixture through
Terminal, Knowledge Add, export, existing-file rejection, and ChatActivity's
terminal state. Its private manifest reuses the same completed run on retries.
Live Preview checks real WebGL assets, refresh and reduced motion at 720x600 to
bound software rendering cost; this does not claim broad cockpit viewport coverage.
Accessibility checks desktop, 390 px, landscape, reduced available height, native
200 percent Chromium profile zoom, keyboard dismissal and workspace/logout
boundaries. Reduced height models available space; it does not emulate a native
mobile software keyboard.

Evidence stays in the disposable organization's `.state/verification` directory:
`proof.json`, focused scenario reports and browser screenshots. Keep credentials,
tokens, private connection settings and screenshots outside Git. Inspect actual
HTTP results, stored revisions/files and run states alongside the screenshots;
passing UI assertions alone does not prove provider completion.

## Workspace controls: local handoff

The colleague completed local browser/integration acceptance for
`refine-workspace-ui-controls` on 18 October 2026. Codex then reviewed the actual
receipts, screenshots, candidate mounts, served frontend assets, and final diff.
All 21 implementation-and-evidence tasks are complete. This status records local
acceptance; it does not authorize a push, CI, or production access.

| Phase / receipt | Verified local result |
| --- | --- |
| `basic` / `proof.json` | `passed: true` at `2026-10-18T06:11:27.153Z`; real group/agent creation, shared workdir attachment, instructions, chat, auth/origin and path protections; `duplicateCount: 1`, `maintenanceRemoved: true` |
| `value-controls.json` | Seven scenarios, including nonempty New-agent Reports to FormData through real discovery, workdir validation and creation; selection/no-results, permission locks, one committed role update, project/PIC reset, retained unavailable values, nested Live Preview popup |
| `schedule-calendar.json` | Asia/Jakarta and America/Los_Angeles UTC round trips, seconds, leap/future boundaries, DST gap rejection, repeated-hour instant preservation, retained draft after API failure, recurrence and paused state |
| `action-board-calendar.json` | Action Board optional planned-start picker, backlog restoration with null start, UTC round trips in Asia/Jakarta and America/Los_Angeles, independent date/time editing, seconds preservation, DST gap rejection, unattached fixture invocation failure recovery retaining revision |
| `action-feedback-core.json` | One save mutation and one top-right toast, retained Saved state and recovery, no duplicate local announcement, real persistence and transport-fault receipts |
| `action-feedback-accessibility.json` | Six layouts/settings including 390 px and actual 200 percent browser zoom; keyboard dismissal, focus/hover timer pause, reduced motion, limited stack expansion/promotion, workspace/logout suppression |
| `settings-proof.json`, `action-feedback-extra-toasts.json` | Project/reporting persistence and cycle rejection; one runtime-refresh/upload toast per action, no duplicate inline success, stored upload content verified |

The candidate was bound to host loopback port 18789. Read-only review matched its
five entry/preload frontend assets byte-for-byte against the local `dist` built
before the final `basic` run. Raw receipts and screenshots remain in the disposable
organization and ignored local evidence directories, outside the source commit.
The basic receipt SHA-256 is
`D3D0BBC0F1B83863B5A984E935280F7D3254D0AD80986EFD1FDB2F78D2A6AB28`.

These receipts cover the listed local paths, not every older smoke phase. They do
not establish production/ARM64 compatibility, provider inference, or a manual
screen-reader session. Calendar boundary tests use a fixed browser clock; the real
server clock and scheduler remain unchanged. Fault tests forward real mutations
before delaying or dropping responses. No product API or persistence mock is used.
The audited forms have no user-facing Reset control, so a future Reset caller
needs its own browser acceptance.

The following instructions reproduce the local checks. Keep them on the laptop;
do not use EC2, production credentials/volumes, or remote SSH workstations.

Use this exact checkout and a disposable loopback candidate with matching backend
source, separate data/home/workdir, and the newly built `frontend/dist`. Existing
candidate images may be reused only after their backend/source correspondence is
established; a successful frontend build does not update a running container.
Do not point the tests at the default `org` directory. Keep the candidate owner-key
file private, accessible to the existing test runner, and out of command output.

From `src`, prepare dependencies and build using the lockfile:

```powershell
$env:PUPPETEER_SKIP_DOWNLOAD = 'true'
npm ci
npm run lint --workspace frontend
npm run build
```

Start or update only the disposable local candidate after checking its actual
Docker mounts and loopback port. Leave other application stacks untouched. If no
source-matched candidate exists, build the platform image locally from the root
with `docker build --target platform -t personal-agentic:ui-controls-local -f src/Dockerfile src`,
then follow the existing disposable-candidate/data setup. Do not repurpose any
production Compose project. Report missing local resources or fixtures rather
than borrowing a remote server.

From `src/frontend`, set the paths to the colleague's actual disposable fixtures:

```powershell
$env:AE_TEST_URL = 'http://127.0.0.1:18789'
$env:AE_TEST_ORG = '<absolute path to the separate disposable test organization>'
$env:AE_TEST_DISPOSABLE = 'true'
node tests/native-smoke.mjs basic
node tests/native-smoke.mjs value-controls
node tests/native-smoke.mjs schedule-calendar
node tests/native-smoke.mjs action-board-calendar
node tests/native-smoke.mjs action-feedback-core
node tests/native-smoke.mjs action-feedback-accessibility
node tests/native-smoke.mjs workspace-navigation
```

For a Docker runner, mount the disposable workdir at the same absolute `/workdir`
path in both the backend and runner, set `TMPDIR=/workdir/acceptance/tmp`, and make
that test directory writable by their test users. The runner can join the candidate's
network namespace and use `http://127.0.0.1:8765`; host access remains on port 18789.
Mount only disposable candidate data read-only into the runner, with a separate
writable evidence directory. Never substitute a production data volume.

The five phases above passed locally; their receipts were reviewed rather than
rerunning the suites during final review. `value-controls` and `schedule-calendar`
use the real authenticated local API and persisted
state, without provider inference. The calendar phase creates far-future tasks,
uses browser contexts in Asia/Jakarta and America/Los_Angeles, and records date/time
round trips, seconds, recurrence/paused state, validation, DST, keyboard and mobile
receipts. Its fixed browser clock is an explicit time-boundary fixture; the real
service clock and scheduler are not replaced. The `action-board-calendar` phase verifies the Action Board's optional planned-start picker, backlog restoration (`planned_start: null`), seconds preservation, independent component editing, leap-year and 3650-day window bounds, DST transitions, unattached agent invocation failure recovery, and mobile/zoomed viewport containment while preserving the agenda layout.

Picker tests use `tests/value-picker.mjs` to open the real popup, search/select
visible labelled options, and verify identifiers on visible controls plus existing
API/persistence receipts. Native `selectOption` and hidden native-select assertions
are not a valid primary proof for the new controls. Selected unavailable options,
group labels, default/empty values, role commitment, permission locks, and dependent
field resets must remain covered.

Run focused settings/operations/workstation/runtime/cockpit regressions where their
real local fixtures are available. Inspect the suite prerequisites first: several
older phases submit provider work, expect signed-in catalogs, or restart a service.
A missing fixture is an explicit unverified boundary, not a passing test or a reason
to use production. The broad legacy coordination/group-scope phases contain older
contracts; migrated fixtures must distinguish current membership UI from legacy
scope API coverage. Do not claim obsolete chat-lead UI is present.

Inspect one viewport and one notification per management result, retained Saved
and error recovery, late results after workspace/logout, long stacked messages,
focus/hover pause and keyboard dismissal. Check Select/Combobox/Calendar inside
dialogs and Live Preview with Escape/focus restoration, search/no-results, touch,
390 px, reduced height, 200 percent browser zoom, and reduced motion. Confirm the
existing Action Board agenda keeps its own layout.

Store screenshots and actual request/state receipts in the disposable organization's
`.state/verification` outside Git, recording the exact source/diff and candidate.
Fix genuine failures without weakening assertions; rerun only the relevant checks
after a fix. A later source change needs relevant verification before its runtime
tasks are marked complete. Archiving and release are separate steps.

## Workspace navigation and candidate restart

The `workspace-navigation` phase exercises the desktop and mobile navigation behavior on a live candidate:
1. Desktop sidebar layout: verifies initial expanded state, resize persistence (180-420 px bounds), collapse to the non-zero rail (~56 px) with the outer panel wrapper contracting and `#content` expanding, reload persistence while collapsed, and expand restoring the previously resized width.
2. Group options and organization: verifies sort menu (A-Z, Z-A, custom), Pinned group management, section creation, moving groups into sections, and collapsing/expanding sections.
3. Account menu and recovery: verifies access to Profile, Runtime settings, Workspace settings, and Archived groups from the account trigger at the bottom of the navigation rail/sidebar. Archived groups can be previewed and restored; deleted groups remain hidden from navigation and links.
4. Mobile navigation: verifies drawer transitions across 320 px, 390 px, and 768 px viewports with touch-accessible controls and zero page overflow.
5. Candidate restart verification: run `node src/scripts/verify-candidate-restart.mjs` against a disposable candidate container controlled from the host Docker CLI. The script:
   - Records container metadata (`StartedAt`, PID) before restart.
   - Writes a known section into `group_preferences` via `PUT /api/preferences/groups`.
   - Restarts the container from the host (`docker restart <container>`) without mounting the Docker socket into the test runner.
   - Polls authenticated `/api/state` until ready, recording readiness latency.
   - Inspects container metadata after restart (`StartedAt`, PID) to prove an actual process restart.
   - Reads `/api/state` and `/api/me`, verifies preferences and the owner's profile
     survived restart, then restores the original group preferences.
   - Writes verification receipt to `.state/runner-verification/container-restart.json`.

The host restart verifier requires `AE_TEST_DISPOSABLE=true`; `AE_TEST_URL` must
be loopback and match `AE_TEST_CONTAINER`'s published port. It reads the owner key
from `AE_TEST_KEY_FILE`, `AE_TEST_KEY`, or the named disposable container without
printing it. Run it from the repository root; no Docker socket is mounted in the
browser runner. External restart receipts remain separate from a browser phase's
own restart result.

## Account profile verification

The `account-profile` phase uses two real browser contexts, the owner-key login
and an existing human account on the local Matrix fixture. Supply the ignored
fixture credentials file via `AE_TEST_MATRIX_CREDENTIALS_FILE`; never put the
password or owner key in a command or receipt. Run from `src/frontend` against a
disposable candidate with its Matrix homeserver reachable:

```powershell
$env:AE_TEST_PROFILE_PHASE = 'prepare'
node tests/native-smoke.mjs account-profile
# From the repository root, restart the same candidate with the host verifier.
# Its receipt must be available in the browser runner's evidence directory.
$env:AE_TEST_PROFILE_PHASE = 'verify'
node tests/native-smoke.mjs account-profile
```

Prepare tests 64/65 Unicode scalar input through the actual form, trim,
clear/fallback, reload, plain-text rendering, invalid API payloads, auth/origin
denials, independent owner/Matrix names, workspace roles and menu permissions.
Verify resumes the same authenticated sessions after a real host restart, checks
identity/profile/membership and agent state, and cleans up only its own fixtures.
Private browser storage states live in ignored `account-profile/` evidence with
restricted permissions; only sanitized `prepare.json`/`verify.json` and screenshots
are review artifacts. `AE_TEST_PROFILE_PHASE=cleanup` recovers an interrupted run.

The existing `action-feedback-review` phase separately proves PUT A commits while
its response is lost, draft B remains after **Check saved profile**, and only one
PUT occurred. This is explicit network-boundary fault injection, not a replacement
backend. Display names never rename Matrix users, alter passwords/owner keys, or
grant workspace/controller access; see [account behavior](README.md#account-display-name).

## Local projects overlay verification

To verify opt-in host project access under `C:/Users/rizky/Documents/GitHub`
mounted to `/projects`, explicitly select a locally built, source-matched platform
image and run from the repository root:

```powershell
$env:AE_TEST_PROJECTS_IMAGE = 'personal-agentic:navigation-local'
node src/scripts/verify-local-projects-overlay.mjs
```

Windows startup must go through `scripts/local-projects-compose.mjs` from `src`
(for example, `node scripts/local-projects-compose.mjs -p agentic-projects-local up -d`).
The verifier uses that same entrypoint for startup. It rejects a missing
`AE_PROJECTS_DIR` source before any Docker call and requires a dedicated project
plus the local Docker Desktop named pipe. Keep the overlay's explicit
`create_host_path: false`, as documented in the [Docker Compose services reference](https://docs.docker.com/reference/compose-file/services/).
An actual local Compose 5.6.0 run rendered that option correctly but still created
the missing Windows source; the preflight is therefore part of acceptance, rather
than assuming the rendered option alone enforces the boundary.

The test creates a uniquely named Compose project (`ae-projects-proof-<nonce>`)
with separate state and loopback ports 18794/18795. It requires a local Synapse
image and a fixture directory under the approved source. It never reuses an
enrolled worker or deletes a pre-existing project:
1. Creates a disposable repository fixture under `C:/Users/rizky/Documents/GitHub` with a unique marker file and commit.
2. Starts the platform and registered worker with `compose.projects.local.yaml`.
3. Asserts non-root UID 10001 execution on both platform and worker containers.
4. Verifies exact marker bytes and Git HEAD commit SHA match across host, controller, and worker containers.
5. Verifies browse discovery via `GET /api/workspaces/directories?path=/projects` showing `Local projects` available.
6. Probes the fixture repository on the controller and on the registered worker runtime via `POST /api/workspaces/probe`.
7. Binds the project workdir to a project group via `POST /api/groups` and verifies persistence in SQLite.
8. Exercises missing host-source startup, worker traversal/symlink containment
   against existing directories, reserved state, workspace ownership and
   controller-access denials, and a registered worker that is actually offline.
   A non-root permission fixture separately verifies the unreadable-root diagnosis.
9. Verifies ownership before every destructive operation and removes only its
   own stack/volumes and exact host fixture in `finally`, including failure paths.
10. Writes verification receipt to `.state/runner-verification/local-projects-overlay.json`.

For the cleanup regression, set `AE_TEST_PROJECTS_FAIL_AFTER_START=1`. That run
intentionally exits nonzero after real worker startup; its failure receipt must
still show every owned resource removed and `cleanupSuccessful: true`. Unset the
flag before the normal run. This is verifier fault injection, not mocked product
behavior. Git trust is restricted to the disposable repository, and credentials
are generated or read privately at runtime rather than embedded in source.

## Workstation location

Use a disposable candidate with separate data, application home, and workdir on a
loopback-only port. Provide one real SSH workstation named Workspace, initially
stored without `location`, a trusted SSH alias to the same test account, and an
existing readable workdir. The account must expose an actual Antigravity catalog;
these checks do not submit an inference prompt. Existing production profiles,
sessions, credentials, or configuration must not be edited for this smoke.

From `src`, set private `AE_TEST_URL`, `AE_TEST_OWNER_KEY_FILE`,
`AE_TEST_WORKSTATION_ID`, `AE_TEST_SSH_ALIAS`, `AE_TEST_WORKDIR`,
`AE_TEST_PROOF_DIR`, and `AE_TEST_DISPOSABLE=true`, then run:

Run the client where its disposable owner key is already available. On Linux,
set `AE_TEST_BROWSER_EXECUTABLE` to the installed Chromium executable; otherwise
the client uses the existing Windows Edge channel. A browser test container may
mount only the disposable owner-key file read-only, without copying credentials
off the candidate host.

```sh
node frontend/tests/workstation-location.mjs initial
# Restart only the disposable candidate, preserving its own volumes/home.
node frontend/tests/workstation-location.mjs restart
```

The initial phase verifies the real editor/API save, legacy and invalid inputs,
Local/Remote/Saved SSH groups, application-environment separation, three selector
entrypoints, a real SSH catalog/probe, project inheritance, historical alias,
unavailable target, and failed-catalog refusal. It records desktop/mobile and CSS
zoom screenshots and checks that no provider task was added. The restart phase
checks the same saved ID, location, agent/project state and catalog after a real
service restart. Screenshots and the private restart manifest stay outside Git.

Local is an owner-declared host location, not verification of machine identity or
host-key trust. Application environment means the container on Docker, and the
application's native environment otherwise. Legacy records and imported aliases
default to `unspecified`; an old client saving without the field can reset a
classification to that value without changing the connection. Owners classify
existing Workspace records explicitly through User settings -> SSH workstations.

`cargo test --workspace --locked workstations::` also exercises actual routers,
SQLite persistence/reopen, invalid location, unchanged profiles and SSH arguments,
metadata-only session retention, destination-change session retirement, active
run/terminal guards and denied controller access. Session/opaque-secret fixtures
in those regressions establish persistence and authorization; they do not prove
provider login, native resume, or a completed agent task.

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

## Project Structure team editor

Use an isolated loopback controller and disposable organization. From
`src/frontend`, set `AE_TEST_URL`, `AE_TEST_ORG`, `AE_TEST_DISPOSABLE=true` and run
`node tests/native-smoke.mjs action-feedback-review`, followed by
`node tests/native-smoke.mjs workspace-navigation` on a fresh disposable fixture.
The review suite needs actual workdir validation, readable native model metadata
for configuration creation, and local Synapse accounts for its existing access
checks. Supply `AE_TEST_MATRIX_USER_ID`, `AE_TEST_MATRIX_USERNAME` and
`AE_TEST_MATRIX_PASSWORD` privately. Do not publish credentials or substitute
successful API/catalog responses. These phases create configuration, not provider
tasks; verify unchanged agent-run counts. Fixture setup writes remain explicit.

Project team is shown directly on every Structure entry/reload/re-entry.
Manage team and Hide team editor are absent; there is no disclosure state,
programmatic heading focus or jump-to-editor behavior. Verify normal keyboard
access to member/Reports to controls and no horizontal overflow at 320/390px.
Unsaved selections remain local to the active visit. Leaving Structure discards
the unsaved draft; merely viewing or navigating never saves or starts agent work.

The maintained review phase calls `tests/project-team-editor.mjs`. Its receipt
`project-team-editor.json` records editor visibility, absent disclosure controls,
real membership/Reports to persistence and removal, reporting-cycle rejection,
unchanged global reporting, zero navigation-only mutations and zero new runs.
Screenshots `project-team-320.png`, `project-team-390.png` and
`project-team-1440.png` cover narrow/desktop layouts and reduced motion. These do
not claim a manual screen-reader session. Successful project/dedicated-agent
creation still shows Structure and its selected profile; cancelled/failed/stale
completion must not redirect another context. Organization retains Deleted agents.

Held real responses are timing injection, not fabricated success. The existing
team save/failed-refresh case must prove one mutation and read-only Retry refresh,
including Create project agent's guard. Anonymous and actual Matrix Member team
writes must be rejected. Retain the account Profile lost-save-response/edited-draft
GET-only recovery check. If that hook changes, also run
`node tests/native-smoke.mjs account-profile-navigation` with the private local
Matrix credentials file in `AE_TEST_MATRIX_CREDENTIALS_FILE`. Keep receipts and
screenshots under the disposable organization's ignored verification path.

## Organization Live Preview

### Live Office work activity

Use the isolated candidate at `http://127.0.0.1:18795`. Set `AE_TEST_URL`,
`AE_TEST_OWNER_KEY` privately, `AE_TEST_WORKDIR` to a disposable child folder
inside the registered runtime root, and `AE_TEST_PROOF_DIR`. Run from `src`:

```powershell
node frontend/tests/live-office-work-activity.mjs
```

This explicitly starts one real Codex task that repairs a disposable cart project.
It temporarily attaches the mapped data engineer to that folder with workspace-write
permission, then restores its profile after the run ends. It checks actual read,
search, edit, build and test events, deduplication, reload/history, timestamps,
passive feed behavior and 320/390/768/1024/1440 px layouts. No API interception
or native provider replacement is used. Inspect `work-activity-proof.json`, screenshots
and actual fixture build/test output. A failed or unavailable provider is a failed
acceptance, not a presentation-only success. Keep the candidate idle while running.

### Specific native command descriptions

After a source build, run `node frontend/tests/live-office-command-details.mjs`
from `src` with the same local candidate URL/owner/proof environment. The mapped
data engineer must be read-only and attached to the verification workdir containing
the existing disposable `cart-activity` fixture from the work-activity suite.
This starts exactly one real read-only Codex task: a multi-file Get-Content call
and a Node.js inline JavaScript evaluation. It verifies actual output 36, metadata,
no profile changes, reload, passive feed and five widths.
Set `AE_TEST_HISTORY_RECEIPT` to the previous work-activity-proof.json to additionally
verify enriched history retains the original event IDs/timestamps/statuses.

### Passive presentation, bubbles and guitar

Run `node frontend/tests/live-office-presentation.mjs` from `src` using the same
isolated candidate URL/owner/proof variables. It uses actual API data and one real
read-only agent task to verify a long multi-file work preview, uniform white surface
and tail, mobile suppression, completed-card semantics, passive feed and reload.
It observes a naturally playing guitar actor through Three.js's existing devtools
observer, without changing scene objects or intercepting responses. Captures show
focused/orbited guitar views and all five viewport widths. Normal/reduced-motion
geometry tests independently cover all five rigs and actual surface clearances.

### Completion outcome regression

Run `node frontend/tests/live-office-completion.mjs` from `src` against the same
isolated loopback candidate. Set `AE_TEST_URL`, `AE_TEST_OWNER_KEY` privately,
`AE_TEST_WORKDIR`, `AE_TEST_PROOF_DIR`, and `AE_TEST_WORKER_PID` to the owned fixture
worker PID. The script rejects another port and verifies that PID belongs to the
fixture worker before fault injection.

It creates three direct native tasks: success reads/tests the existing cart fixture;
failure terminates only the unique Codex descendant of the owned worker after the
UI observes working; cancellation uses the authenticated `/runs/{id}/cancel` API.
Neither controller nor worker is terminated. No provider/API response or DB row is
faked. The maintained script does not alter agent profiles. The application's
normal automatic failure-review run may also execute; it is recorded separately
by parent run identity. The failed direct run must not be confused with that review.

Inspect completion-proof.json: succeeded has one observed Beres, failed/cancelled
have none, actual latest-result IDs/statuses agree, no page errors, profiles and
fixture hashes are unchanged. Keep all task state, logs and screenshots ignored.
This fault-injection suite is restricted to the owned disposable local fixture.

### Live Office idle behavior

Use an isolated local candidate at `http://127.0.0.1:18795` with its own organization
and a real registered runtime rooted in a disposable workdir. Set `AE_TEST_URL`,
`AE_TEST_OWNER_KEY` privately, `AE_TEST_RUNTIME_ID`, `AE_TEST_WORKDIR` and
`AE_TEST_PROOF_DIR`. From `src`, run:

```powershell
node frontend/tests/live-office-idle.mjs
```

This configures only the candidate's cockpit profiles and observes `/office` for
five minutes (`AE_TEST_OBSERVE_MS` can change the observation window). It does not
intercept API responses. By default it does not invoke provider work. Three.js's existing devtools
observer reads the actual rendered scene for world anchors and guitar contacts.
Receipts include activity text, bubble transition timestamps, guitar views, a mobile
screenshot, unchanged run/profile checks, and the absence of idle feed entries.
Real work history survives reload; it is independent of scene roaming. A failure
still saves `idle-proof.json`; inspect its errors before claiming acceptance.
Random roaming may require a longer observation for every character/spot. This
smoke alone does not prove interruption by a model task. With explicit authorization,
set `AE_TEST_RUN_INTERRUPTION=true` to submit a read-only fixture task through the
candidate's authenticated message API and registered runtime. A provider failure is
recorded as a real limitation, never replaced with a mock success.

Pair the receipt with cockpit unit/check output and the tested frontend build hash.
Clock/random control in unit tests verifies deadline boundaries and eligibility;
it is not a substitute for actual rendered timestamps or real provider evidence.

Build the real service and frontend, configure the isolated candidate with the idle
smoke above, then run `npm run test:e2e --workspace cockpit` from `src` with the same
private owner key and a separate `AE_TEST_PROOF_DIR`. The standalone suite checks
the Organization button opening `/office`, the `/organization/live-preview` alias,
four desk camera views and actual mesh bounds, desktop/mobile, reduced motion,
offline/recovery, public-read/authenticated-write boundaries, remount, workspace
isolation, and unchanged profiles/runs. It uses real HTTP, SQLite, assets and WebGL.
It records two minutes of production bubble timestamps with no API interception.

The older overlay suite is retained as `npm run test:e2e:legacy --workspace cockpit`.
It currently fails because this checkout routes both office URLs to StandaloneOffice,
while the suite expects an overlay and a button named Live Preview. Do not claim
its overlay/focus-trap coverage passes for the standalone page. The owner approved
the standalone acceptance contract on 2026-11-02; the historical coverage below
describes the retained legacy scripts.

Legacy invocation: run `node frontend/tests/cockpit-live.mjs` from `src`
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
no new provider invocation. The baseline referenced `docs/cockpit-integration-result.md`, which is absent
from this checkout. Treat that paragraph as a historical record, not current proof.
Current Live Office evidence is indexed in [the review](cockpit/docs/live-office-review.md).

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

## Runtime usage and action-feedback acceptance

Use a disposable loopback controller and newly enrolled disposable worker states.
Do not reuse a production registration or point these tests at a remote URL.
`backend/tests/runtime_usage.py` requires `AE_TEST_OUTPUT`, `AE_TEST_BINARY` and
`AE_TEST_CODEX` (the complete signed-in native CLI executable). Optionally set
`AE_TEST_LEGACY_BINARY` to an older real binary, `AE_TEST_ANTIGRAVITY` to the native
AGY executable, and `AE_TEST_BROWSER=1` to run the real browser acceptance after
API checks. Browser tests use installed Chrome by default; override with
`AE_TEST_BROWSER_EXECUTABLE`. All test processes and worker registrations belong
to the disposable controller. Tokens are not written into receipts.

From the repository root, run `python -X utf8 -B src/backend/tests/runtime_usage.py`.
The fixture uses an unreadable-as-file `.env` directory in a disposable workdir;
usage must succeed without entering ordinary task execution. It records source
results, request deduplication, worker compatibility and zero provider/terminal
runs. The browser runner is `frontend/tests/runtime-usage-feedback.mjs`, run from
`src` with `node` and explicit `AE_TEST_URL`, `AE_TEST_ORG`, `AE_TEST_OUTPUT`.
Network fault injection delays/aborts real requests; it does not return invented
product responses or fake authentication.

Routine sidebar changes are immediate, silently persisted and serialized. A
no-op selection must send no PUT. Test rapid collapse/expand while holding the
first real PUT, same sort/section, pin/unpin and keyboard/drag reorder. Inspect
SQLite/API state after completion and reload. Rejected writes retain editable
section drafts; uncertain writes require read reconciliation. Acknowledged saves
with failed refresh keep a read-only Retry refresh action across hide/show.
Explicit section create/rename/remove and recovery retain outcome feedback.

Action failures/warnings have one Base UI toast owner, including entrypoint,
chat and `/usage`. Field constraints remain at inputs. Passive polling errors,
saved run/terminal output, indexing failures, workdir diagnoses and preview
availability are durable contextual state; opening history must not emit toasts.
Verify keyboard focus, zoom, reduced motion, rail and mobile navigation without
changing the existing layout or Matrix/owner-key login order.

The existing `action-feedback-review` suite can use `AE_TEST_MATRIX_USERNAME`,
`AE_TEST_MATRIX_USER_ID` and `AE_TEST_MATRIX_PASSWORD` for dedicated accounts on
an already configured local Synapse. Supply the password through a private test
process environment, never in recorded commands. Configure the disposable
controller's Matrix bot through its existing settings. This tests current login
and membership enforcement; it does not implement invitation onboarding.

## Matrix member invitation onboarding

Build the native controller and web bundle locally. Set `AE_TEST_BINARY` to the
built native executable and `AE_TEST_OUTPUT` to a new, ignored directory, then run
`python -B src/backend/tests/matrix_member_onboarding.py` from the repository root.
Docker Desktop must already be running and Chrome must be installed. The harness
creates its own local Synapse v1.161.0 container (512 MiB, 0.5 CPU), new platform
SQLite and two isolated Chrome contexts on loopback ports 18811–18813. It never
uses the user's local application volumes, production, SSH or a provider.

The fixture's forwarding proxy passes requests to real Synapse. For lost-response
acceptance it discards one genuine registration response after the account is
created. A temporary trigger in the disposable platform DB interrupts one real
membership insert. Neither boundary creates fake accounts or bypasses product
authentication. Browser clipboard denial is the only browser permission stub.
Expiry, exhausted attempts, abandoned leases and issuer-role changes are controlled
state fixtures in the same real database. Receipts include only labels, statuses
and test IDs, never passwords, links, owner keys or registration secrets. Private
fixture state remains ignored. The test stops its controller and removes only its
own temporary Synapse container; it never deletes user data/volumes.

Required checks include owner/member/anonymous authorization, tampered request
fields, configured/unconfigured provisioning, real non-admin account creation,
no retained temporary registration session, ordinary Matrix login, room/workspace
isolation, single-use/replay/concurrency, expiry/revoke, username collision,
restart, genuine partial failure and authenticated reconciliation. Run affected
backend tests with `cargo test --workspace --locked matrix_invite` and web checks
with `npm run lint --workspace frontend` and `npm run build --workspace frontend`.
Actual commands/results and any limitations belong in the active OpenSpec change's
verification report; this runbook is not a claim that an unrun test passed.


## CI pipeline admission

Run `python -B infra/ci/tests/workflow_test.py` from the repository root. The
standard-library contract test reads the actual workflow and release-job rules
and evaluates their supported equality/conjunction syntax; it rejects unsupported
syntax rather than pretending to implement the full GitLab evaluator. No GitLab
API, runner, SSH, production service or provider is contacted.

Only merge-request events and the default branch (main) may create pipelines.
Feature-branch pushes are rejected even before an MR exists; opening/updating its
MR runs verification. Default-branch push/manual/scheduled pipelines retain their
existing release gates, including explicitly selected protected-main worker
packages. Tag and non-default-branch manual/scheduled pipelines are rejected.
The production_config job runs the same test. Actual GitLab scheduler behavior
is established only after a later authorized push/MR; local contract tests do not
claim a live pipeline was executed.


## Workspace invitation experience

Workspace settings keeps People and Invitations distinct. **Invite teammate** opens
one dialog: **Create invite link** is the default, while **Existing Matrix account**
accepts a Matrix ID and the existing Member/Owner role choice. Opening the dialog
or changing tabs never creates an invitation. New-account links always grant
Member access; account creation does not sign the recipient in automatically.

A newly displayed link remains in memory across dialog close/reopen and tab
changes in the same selected workspace. Hide link, workspace changes, logout,
and document exit discard it. Inventory has statuses and expiry, not recoverable
raw links. Clipboard denial leaves selectable manual copying. No link/password
is saved to browser storage or printed in notifications/evidence.

The recipient form shows brief field help with full username/password/account
rules under an accessible disclosure. Partial acceptance has its own same-account
recovery instructions. A confirmed registration shows **Account created** and
**Sign in**. Refreshing the token-free page or reopening an already-used link
shows neutral sign-in/new-link guidance; it does not prove signup failed.
Transport errors and retryable 429/5xx inspection responses have a read-only retry.

Use a disposable loopback controller with the candidate frontend mounted read-only,
a matching local backend, and separate real Synapse/data/secret from the user's
normal localhost application. Set AE_TEST_URL, AE_TEST_ORG, AE_TEST_OUTPUT and
AE_TEST_DISPOSABLE=true for the owned fixture. The partial-membership regression
also requires AE_TEST_SQLITE_FAULTS=true: it temporarily rejects one insert into
that fixture's actual SQLite members table and removes the trigger before retry.
Use AE_TEST_SQLITE_VOLUME=personal-agentic-invitations-test-data and set
AE_TEST_SQLITE_IMAGE to the already-installed Synapse image digest. The helper
uses that owned Linux volume so Windows/Linux WAL caches cannot mask the fault.
Set AE_TEST_MATRIX_CONTAINER=personal-agentic-invitations-test-matrix and
AE_TEST_MATRIX_URL to its loopback endpoint for the real outage regression.
Never enable this option against user, shared, or production data.

From src, run:

```powershell
npm run lint --workspace frontend
npm run build --workspace frontend -- --outDir '../../.state/refine-workspace-invitations/frontend-dist'
node frontend/tests/matrix-member-onboarding.mjs
```

Verify candidate served assets against the built files first. Browser assertions
retain real account creation, membership, normal login, Owner/Member permissions,
reserved-name checks, token-free URLs/storage, and unchanged owner sessions.
Additional coverage checks keyboard tabs/focus return, retained link/drafts,
manual copying, accurate inventory/revoke behavior, refresh/reopened-link recovery,
partial acceptance, 320/390 px layouts, actual 200 percent browser zoom, reduced
motion, one notification per action, and zero agent runs.

Fault injection is limited and explicit: denied clipboard permission, aborted or
429/503 gateway responses for inspection, and an opt-in temporary SQLite membership
insert trigger plus one unknown persisted status with fixture constraints
explicitly bypassed to exercise forward-compatible rendering. A delayed response
retains the actual completed server mutation. Successful API/provisioning/authentication paths use the real
controller, SQLite and Synapse. Screenshots mask link/password controls. Keep
receipts, logs, candidate state and fixture secrets under ignored protected .state;
do not commit them. This section documents checks, not a claim they have run.

## Account Profile and explicit group Search

Use a disposable loopback controller with its exact backend revision, current frontend assets, real SQLite, local Synapse and an existing disposable Matrix account. Do not run these mutations against a normal local organization or production. No worker or agent task is needed. Keep credentials and receipts in ignored `.state` paths.

From `src/frontend`, set `AE_TEST_URL`, `AE_TEST_ORG`, `AE_TEST_DISPOSABLE=true` and `AE_TEST_MATRIX_CREDENTIALS_FILE` (a private JSON file containing `human.username`, `human.password`, `human.user_id`). Run `node tests/native-smoke.mjs account-profile` with `AE_TEST_PROFILE_PHASE=prepare`, restart only the disposable controller, and capture its container ID, PID/start time before/after and endpoint readiness latency in `container-restart.json` under the harness verification directory. Then run the same command with `AE_TEST_PROFILE_PHASE=verify`; it confirms persistence/login and restores original names/deletes its test workspaces. Use `cleanup` if interrupted. The existing test distinguishes inline invalid-field guidance from one save outcome toast. A local aborted PUT exposes saved-value inspection; delayed real PUT/GET responses exercise workspace ownership.

Run `node tests/native-smoke.mjs group-search` against the same disposable controller. The suite creates three groups, ordinary messages without recipients, a document and two red-circle images, and indexes the files through the real knowledge API. It verifies keyword/document/image matches, file access, group isolation, explicit submission, UTF-8 limits, request cancellation, one error toast and keyboard/responsive behavior. Successful search responses must remain real. Route delays and a deliberate request abort are failure/timing injection only, documented in its receipt. Keep actual model-cache/index dependencies available locally; report a missing dependency rather than replacing successful results with mocks or using a server fallback.

Search trims Unicode White_Space and U+FEFF at both the UI and API boundary before
checking a nonempty query of at most 1,000 UTF-8 bytes. Internal spaces remain
significant. Compare actual result IDs for plain/padded queries, ASCII case and
Enter/button submission. Include NBSP, U+0085, U+FEFF, whitespace-only input,
250/251 four-byte emoji and a padded 1,000-byte query through both boundaries.
The byte limit applies after normalization; direct API validation errors are 400.

Semantic `/api/search` responses retain `artifacts` and add
`indexed_artifact_count`: distinct indexed Knowledge artifacts in the selected
workspace/group and media mode (`text/` for Documents, `image/` for Images).
Stored/indexing/failed/deleted/non-Knowledge records do not count. A zero count
returns an empty list without starting an embedding query; nonempty-corpus index
failures remain HTTP errors. This count describes persisted metadata, not vector
store integrity or the number of query matches. The frontend keeps a missing
count unknown for older responses rather than interpreting it as zero.

Verify distinct UI states for no indexed documents/images, an actual empty result
with indexed content, and a failed request. Scope guidance names the active
project/group and explains that workdir files and chat links are not indexed
automatically. Searching never uploads/indexes files or starts an agent task.
The real suite additionally covers empty/stored/document-only/image-only/both-ready
states and stale availability. Run `node --experimental-strip-types --test tests/group-search.test.mjs` for
pure normalization/empty-copy contracts; these fixtures are presentation-only
proof, not substitutes for the real indexed document/image acceptance above.

Search opens through the active-group sidebar action or Ctrl+K (Windows/Linux) / Command+K (macOS), outside other editors/dialogs. The shortcut focuses the query if Search is already open. Typing and mode changes never search; only Enter or Search submits. Repeat the no-provider navigation suite with `node tests/native-smoke.mjs workspace-navigation`, preserving rail/resize/mobile drawer behavior. Run `npm run lint` and `npm run build` after final edits; an isolated build can use `--outDir ../../.state/<change>/frontend-dist` so the running user's mounted bundle stays unchanged.

Repeated disposable Matrix acceptance sessions can hit Synapse's legitimate-login and per-user invitation rate limits. For this isolated fixture only, set `rc_login.address`, `rc_login.account`, and `rc_invites.per_user` to `per_second: 10` / `burst_count: 100`, recording that policy in the fixture receipt. Failed-login rate limits stay at their defaults. This is test-throughput configuration, not proof of rate-limit behavior; never apply it to an ordinary local workspace or production as part of these tests. Browser timing fixtures must propagate delivery errors through a bounded completion gate and may classify an already-handled route as cancellation only with an observed request failure or main-document navigation. Screenshots wait for finite animations to finish, without fixed sleeps.

The `account-profile-navigation` phase (`node tests/native-smoke.mjs account-profile-navigation`, using the same disposable Matrix fixture settings) holds actual successful profile PUT/GET responses across SPA navigation. It verifies Owner and Member Save → Runtime → Profile both before and after acknowledgment, Owner Save → Chat → Profile, and an acknowledgment-lost write followed by read-only inspection after navigation. Saved names, sidebar, draft, pending/Saved controls, exactly one outcome toast and zero extra writes must agree with real persistence. A delayed failure from an abandoned workspace must remain silent and cannot overwrite a newer save in the selected workspace. Original profile names are restored. Keep this regression alongside the existing `account-profile` prepare/restart/verify phases, which separately test suppression of abandoned-workspace responses. Profile form mounting must not own the request lifetime: its controller lives at account/workspace scope, with a fresh lifetime token on scope change.
