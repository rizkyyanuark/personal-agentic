# Personal-agentic cockpit

The read-only Three.js office is a private JavaScript package mounted by the
React **Organization → Live Preview** route. Rust serves the authenticated
`/api/cockpit/state` projection and the one production frontend bundle. The
cockpit has no production Node server, database access, or execution API.

The React wrapper presents the scene in a nearly fullscreen floating dialog above
Organization. It owns the backdrop, close button, workspace filtering and explicit
profile settings. The scene retains its original controls: cards focus desks,
character tags track characters, and Escape/double-click reset the camera. Scene
selection never navigates to agent configuration.

The wrapper uses the original virtual-kantor HUD, cards, typography and mobile
dock. It does not enable a compact redesign. CSS is scoped to the host and uses
container dimensions so the original composition fits below the React toolbar.
Camera focus, tracking, orbit, tabs and panel controls retain their original behavior.

Mapped identity labels read the Organization `position`, never its long `role`
description. Empty mapped positions omit the badge; unmapped slots retain their
original short role label. Header labels remain Status, Tugas selesai, Aktif
sekarang, Token diproses, and Sesi kerja (the device WIB clock). Tokens read
persisted usage, with reported/total run coverage in their tooltip. Missing usage
and numeric overflow show `—`; measured zero remains `0`. Partial coverage does
not claim live throughput or remaining provider quota.

## Install and verify

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
are superseded by the [integration strategy](../../docs/cockpit-integration-strategy.md).

The test-only legacy ledger and HTTP fixtures retain privacy/boundary assertions
from the imported project. Production boundary coverage now lives in Rust's
`backend/src/cockpit.rs` and the real React browser suite. Keeping these fixture
tests does not claim a second deployed API or substitute for testing Rust.
