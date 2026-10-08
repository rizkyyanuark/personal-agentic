# Integrated cockpit architecture

The production user path is **Organization → Live Preview** in personal-agentic.
The existing React shell owns authentication, workspace selection, the team
filter, and polling. A lazy route mounts the Three.js scene package; leaving the
route disposes its animation, listeners, observers, and GPU resources. The scene
occupies a nearly fullscreen floating dialog above the still-rendered Organization
view. The React wrapper owns dismissal and integration settings; original scene
cards focus desk cameras and character tags track characters without navigation.
Escape within the cockpit keeps its camera/mobile-panel meaning; toolbar Escape
closes the dialog.

## Data and authorization

Rust provides `GET /api/cockpit/state`, optionally filtered by an active
`group_id`. The existing session and workspace owner checks apply. The endpoint
projects five persisted role-to-agent mappings from the selected workspace's
real profiles, runs, questions, actions, and events. It exposes generic activity
summaries rather than prompts, outputs, credential records, or filesystem paths.

`POST /api/cockpit/setup` and `PUT /api/cockpit/mapping` are explicit owner
configuration actions in React. Opening the preview only reads status. Setup
creates missing profiles paused and unattached, preserving existing agents;
mapping an existing profile preserves its properties and reporting lines.
Execution remains in the existing chat/Actions path.

React sends the explicit workspace header, checks snapshot workspace/filter
identity, aborts stale requests, and polls while the document is visible. It
marks failures, expiry, or loss of access clearly. The scene consumes
`CockpitSnapshot` through `updateState`; it has no production HTTP transport or
database reader. Unknown runtime status, filtered agents, waiting for an owner
answer, and waiting for delegated work remain distinct from idle work.

The scene's local roaming, camera, clock, and decorative dialogue do not create
backend events or claim actual agent actions. Motion pauses for stale data,
hidden tabs, and reduced-motion preferences. WebGL failure retains the DOM
status controls.

## Build and lifecycle

`frontend` and `cockpit` are npm workspaces installed from `src/package-lock.json`.
Docker builds one React/Vite production bundle and Rust serves it on the same
origin as the API. The scene stays JavaScript behind an explicit typed package
interface; React does not recreate its scene graph as UI components.

`mountCockpit(container, options)` returns `updateState`, `setConnection`, and
idempotent `dispose`. DOM lookups and CSS belong to the cockpit container.
Resize/media behavior follows the container's dimensions. Late model loads
after disposal release their resources rather than attaching to a new mount.
The package's Vite library build externalizes Three.js and addons; production
imports package source so that the app controls lazy loading.

Assets have one canonical source at `frontend/public/cockpit-assets` and are
loaded through the configured `/cockpit-assets/` base. No owner key enters build
environment variables, scene assets, or URL parameters.

## Verification and predecessor history

Rust cockpit tests cover the actual persisted projection, role setup/mapping,
privacy, status semantics, authorization, and workspace boundaries. The real
React browser suite covers entrypoint-to-output behavior, read-only opening,
filtering/reload, outage recovery, remounts, responsive widths, and isolation.
Package unit tests retain the existing scene, seating, pose, and accessibility
regressions.

The old Express server and SQLite ledger reader are test-only fixtures under
`tests/legacy`; their existing privacy/HTTP regressions remain enabled. Their
former production source paths, startup command, and systemd deployment were
retired because Rust now owns that boundary. The old browser scripts describe
the predecessor page/global interface; the package's `test:e2e` command invokes
the current real React suite. Historical architecture and systemd templates are
archived under `docs/legacy`.

See the root [integration strategy](../../../docs/cockpit-integration-strategy.md)
for scope, decisions, and acceptance gates.
