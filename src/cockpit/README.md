# Personal-agentic cockpit

The read-only Three.js office is a private JavaScript package mounted by React
at `/office` and `/organization/live-preview`. **Organization → Live Office**
opens `/office` in a new tab. Rust serves the public, sanitized
`/api/cockpit/state` projection and the production frontend bundle. The cockpit
has no production Node server, database access, or execution API.

`StandaloneOffice` owns polling and accepts the optional `?group=<id>` filter.
Public viewing uses the default workspace; an authenticated session can select
its own workspace. Setup and mapping remain owner-only main-application actions.
Cards focus desks, character tags track characters, and Escape/double-click reset
the camera. Scene selection never navigates to agent configuration.

The original virtual-kantor HUD, typography and mobile dock remain, scoped to
container dimensions. The earlier floating React overlay and its focus-trap suite
are retained as legacy code/tests, not the current entrypoint. See
[review and commit plan](docs/live-office-review.md) for the shared delivery record.
Detailed OpenSpec contracts remain local and are not included in a fresh clone.

Mapped identity labels read the Organization `position`, never its long `role`
description. Empty mapped positions omit the badge; unmapped slots retain their
original short role label. Header labels remain Status, Tugas selesai, Aktif
sekarang, Token diproses, and Sesi kerja (the device WIB clock). Tokens read
persisted usage, with reported/total run coverage in their tooltip. Missing usage
and numeric overflow show `—`; measured zero remains `0`. Partial coverage does
not claim live throughput or remaining provider quota.

## Install and verify

Idle cards and character details describe the scene's current activity or walking
destination, with waiting context and without a decorative provenance caption. The activity panel contains actual work
history, retained after completion and reload, with up to 100 distinct steps.
Rows show name, time and action as passive text, without completion badges or run links.
Actual run status and errors retain priority over leisure descriptions.

The pantry counter and its adjacent floor plant use the reference X/Z positions
(8.2, -6.45) and (6.6, -6.4). Workstations omit desk mats. Guitar hand contact follows
the prop as the torso moves. Ambient dialogue starts after four active seconds,
then attempts every 7 to 11.5 seconds, with replies starting 2.3 seconds into each
4.8-second opener. Arrival quips do not repeat on a stationary timer.

From `src`, install both web workspaces with the shared lockfile:

```powershell
npm ci
npm run check --workspace cockpit
npm run build
```

The package check runs ESLint, Prettier, scene/contract regressions, and a Vite
library build. The library externalizes Three.js and its addons. The real
application build is the React build, which imports the package source and
produces the lazy cockpit chunk in `frontend/dist`.

For browser proof, run the Rust application or Docker platform first. Set
`AE_TEST_URL` to its origin, `AE_TEST_OWNER_KEY` privately to its owner key, and
optionally `AE_TEST_PROOF_DIR` to a screenshot directory. From `src`:

```powershell
npm run test:e2e --workspace cockpit
```

This runs the parent application's real-service browser suite. It creates
disposable workspaces and exercises navigation, read-only opening, explicit
profile setup, filtering, profile links, connection recovery, remounts,
responsive widths, workspace isolation, and session expiry. It soft-deletes its
verification workspaces afterward. It does not start a model task. Real agent
execution requires a separate smoke run against a configured runtime.

The suite measures nine desktop, phone, and short landscape viewports, including
card heights and unobstructed canvas area. It preserves camera selection through
resize and tests the Refresh icon with normal and reduced motion. See the exact
sizes, gates, and read-only deployed command in [verification](../VERIFICATION.md).
Use the command's measured output and screenshots to confirm a build; this
documentation does not assert that the latest deployment has passed.

## Development

Prefer the parent application to verify workspace switching, authentication,
filters, and profile configuration. For isolated scene iteration, the package's
thin development page uses the same real Rust API:

```powershell
$env:COCKPIT_API_URL = 'http://localhost:18766'
npm run dev --workspace cockpit
```

Enter the owner key in the development form. It stays in page memory and is sent
as a bearer credential to the loopback API proxy; it is not placed in the URL,
browser storage, or build output. This development page observes the default
workspace and provides no setup or execution controls. It is not included in
the production application bundle.

Static scene assets live once in `../frontend/public/cockpit-assets`. The React
wrapper supplies `/cockpit-assets/` to `mountCockpit`. Vite's development server
uses the parent's public directory; the package library build does not copy it.

## Structure

```text
src/client/mount.js        mountCockpit lifecycle boundary
src/client/index.d.ts      typed public package interface
src/client/snapshot.js     safe Rust snapshot → scene presentation
src/client/scene/          Three.js scene graph and motion
src/client/ui/             scoped DOM panels, labels, and cards
tests/unit/               scene and contract regressions
tests/legacy/             test-only predecessor ledger/HTTP fixtures
docs/                     visual references and architecture
docs/legacy/              archived predecessor deployment documents
```

Read [architecture](docs/architecture.md) before changing data boundaries and
[visual acceptance](docs/visual-acceptance.md) for scene behavior. The imported
AI Lab PRD, ADRs, reports, and legacy browser scripts preserve the visual
project's history. Their ledger, public-access, systemd, and port-8095 assumptions
are superseded by the native Rust backend integration.

The test-only legacy ledger and HTTP fixtures retain privacy/boundary assertions
from the imported project. Production boundary coverage now lives in Rust's
`backend/src/cockpit.rs` and the real React browser suite. Keeping these fixture
tests does not claim a second deployed API or substitute for testing Rust.

## Work activity

Idle scenes describe each agent on its card and character detail. The left activity
panel retains actual work, with operation/path labels, second-level timestamps,
failure-aware descriptions. This is a passive office view; entries do not navigate to run details. Native
Antigravity/Codex/OpenCode adapters expose only safe metadata. Unknown operations
keep an honest generic label; prompts, reasoning and raw output remain private.

Completed agents return directly to Santai; idle cards show the scene action and
Menunggu tugas baru, with factual failure/offline/waiting context where needed.
Bubble surfaces are uniformly white; work previews use at most 48 graphemes and
three desktop lines. Mobile keeps work on cards and limits dialogue to two lines.
Full public detail remains in the character detail panel. The acoustic guitar uses
a proper rotation with a raised neck toward anatomical left, without reflection;
palm/soundboard/torso clearances are verified on all five rigs.
