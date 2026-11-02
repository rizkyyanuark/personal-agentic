# Integrated cockpit architecture

The production user path is **Organization → Live Office**, which opens `/office`
in a new tab. `/organization/live-preview` mounts the same `StandaloneOffice`
component. It owns visible-document polling, cancellation and the optional
`?group=<id>` filter. Leaving the route disposes animation, listeners, observers
and GPU resources. There is no Organization backdrop or overlay close/focus trap
on this path. Cards focus desk cameras; character tags track characters without
navigation. Escape retains the scene camera/mobile-panel meaning.

## Data and authorization

Rust provides `GET /api/cockpit/state`, optionally filtered by an active
`group_id`. Public reads use the default workspace; authenticated reads use the
selected workspace and existing workspace authorization. Setup/mapping writes
remain owner-only. The endpoint
projects five persisted role-to-agent mappings from the selected workspace's
real profiles, runs, questions, actions, and events. It exposes bounded descriptive activity and safe relative paths, never prompts,
raw output, credential records, scripts or private absolute paths.

`POST /api/cockpit/setup` and `PUT /api/cockpit/mapping` are explicit owner
configuration actions in React. Opening the preview only reads status. Setup
creates missing profiles paused and unattached, preserving existing agents;
mapping an existing profile preserves its properties and reporting lines.
Execution remains in the existing chat/Actions path.

The API client supplies the current workspace header; Rust resolves that scope
and the optional group filter. React aborts stale requests and polls only while
the document is visible. It
marks failures, expiry, or loss of access clearly. The scene consumes
`CockpitSnapshot` through `updateState`; it has no production HTTP transport or
database reader. Unknown runtime status, filtered agents, waiting for an owner
answer, and waiting for delegated work remain distinct from idle work.

The scene's local roaming, camera, clock, and decorative dialogue do not create
backend events or claim actual agent actions. Motion pauses for stale data,
hidden tabs, and reduced-motion preferences. WebGL failure retains the DOM
status controls.

## Idle activity presentation

The scene controller reports current and target destinations, phases and arrival IDs.
One presentation projection supplies the card and character detail. It distinguishes
TV/PS, coffee/water, guitar, window, reading and meeting; walking describes the
destination before arrival. Operational errors and active work take priority.
Idle activity never enters the work feed, Rust event store or run/token totals.

The left panel contains real work only and retains the latest 100 distinct steps
after a run finishes. Rust normalizes Antigravity, Codex and OpenCode tool events
into safe operations and workspace-relative targets, updates each step on completion
or failure, and omits generic run-change and response lifecycle noise. Current
activity is read independently of the bounded history. Entries show seconds and descriptive text only, without run links or step badges.
Run/group/step metadata remains internal to the projection; the office UI does not navigate into execution details.
Raw commands, tool output, prompts and reasoning never enter the public snapshot.

The pantry counter uses world X/Z (8.2, -6.45), with its adjacent floor plant at
(6.6, -6.4). Its 0.8 scale clears the cabinet without moving the anchor. The
dispenser and interaction targets fit the local room bounds.
Navigation shares these anchors. Workstations have no desk mat; keyboard, mouse
and typing contacts use their adjusted surface heights. Guitar hand targets follow
contacts on the actual torso-mounted guitar instead of independent world offsets.

Ambient dialogue follows kantor-agent commit ad92a7a473b3d0e769281d552cee74cbb4004a54:
first attempt after four active seconds, then attempts every 7 to 11.5 seconds.
The opener lasts 4.8 seconds; the reply begins 2.3 seconds after it starts and lasts
4.2 seconds. Their bubbles overlap. Guitar/window occupants remain eligible.
Arrival quips use a 55 percent chance and do not repeat on a stationary timer.
Hidden/stale data, reduced motion and real work cancel pending conversations.

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

See [visual acceptance](visual-acceptance.md) and the root [architecture](../../../ARCHITECTURE.md)
for scope, decisions, and acceptance gates.

Native command detail follow-up: supported PowerShell file arrays use optional
relative_files, retaining relative_file for older clients. Recorded shell wrappers
are decoded before command classification; Node --eval has a specific JavaScript
label. For legacy missing details, Rust may read the immediate next same-run event
only if it is a matching native command output. SQLite extracts command metadata
without returning raw output or script text to the browser. Event identities, times,
states and stored rows remain unchanged; absent/unrelated sources are never guessed.

Presentation follow-up: no transient completed-card state or repeated decorative
card label. Bubble previews are bounded independently of the full public narrative;
all surfaces/tails are white. Non-dialogue bubbles, including work events, are suppressed at container widths
up to 820px. Only the text span is line-clamped, keeping the tail visible. Guitar
geometry and pose contacts use one unreflected acoustic prop, with anatomical axes
and radius-aware clearances covered in real Three.js tests.

Completion speech uses only active run IDs and latest result ID/status already
present in the public snapshot. The JS adapter carries this bounded provenance;
mount requires a fresh visible working-to-idle transition for the same explicitly
succeeded run and no remaining work. Missing or ambiguous parallel provenance
suppresses speech. No backend schema, endpoint or database migration is added.
