# Agentic Enterprise frontend

React 19, TypeScript, Vite, Tailwind and official shadcn components. The Rust service serves the production bundle and same-origin API.

```powershell
cd ..
npm ci
npm run build
npm run lint --workspace frontend
```

Build Rust and export shared types first using `../scripts/Build.ps1`. Start/open the application with the native scripts documented in [the application README](../README.md). The frontend has no independent database or mock API. Shared TypeScript bindings come from `backend/src/model.rs` via ts-rs.

The lazy Organization Live Preview route mounts the sibling `@personal-agentic/cockpit`
package in a nearly fullscreen floating dialog above Organization. Cards preserve
their original desk-camera focus. React owns authenticated polling and workspace/team selection; the scene
receives typed snapshots and releases its resources when the route closes. Static
scene assets live once in `public/cockpit-assets`. Both npm packages use the root
`src/package-lock.json`.

Live Preview uses the original virtual-kantor design without compact HUD or card
overrides. Its outer toolbar remains separate. Cards focus their original desks or Orion's
room center; character picks track the character, and manual orbit releases
tracking. Resize keeps the mounted canvas and camera selection.

The office title follows the selected project's workdir or the unique effective
workdir of mapped agents in scope. Active run workdirs take precedence over
profile defaults. Different workdirs show `Beberapa workdir`; unknown contexts
use the workspace name. The full path/SSH host is available in the title tooltip.
Cards use Santai/Bekerja/recent Selesai and actual runtime/run details, following
Kantor Agent. Selesai means the run ended less than 60 seconds ago; failed,
cancelled, interrupted and timed-out outcomes remain explicitly visible.
Decorative scene activity does not supply card status.

From `src`, verify workdir/scope boundaries with
`node --experimental-strip-types --test frontend/tests/cockpit-workspace.test.mjs`.

Identity badges use the Organization `position`, never its long `role`
description. A mapped agent with no position shows only its name. The original
metric labels are Status, Tugas selesai, Aktif sekarang, Token diproses, and
Sesi kerja; the last remains the device's WIB clock. Tokens are persisted usage,
with reported/total run coverage in the tooltip. Missing measurements or a sum
beyond the JavaScript safe integer limit show `—`; genuine reported zero shows
`0`. Usage may be partial and does not represent provider quota or live throughput.

The Refresh icon requests a fresh authenticated snapshot and marks itself busy.
Its rotation is disabled by reduced motion while refresh continues. The real
service suites in [verification](../VERIFICATION.md) measure nine viewport sizes;
their output is the deployment proof, not the existence of the tests.

The real browser smoke phases are `node tests/native-smoke.mjs basic`, then `codex`, `knowledge`, and `recovery` against the running native service. Use the complete instructions in the application README; Codex tests consume the signed-in account's normal usage.
