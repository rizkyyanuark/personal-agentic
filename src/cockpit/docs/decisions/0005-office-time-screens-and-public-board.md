# Office time, role screens, and public task board

Date: 29 September 2026.
Status: implemented in workspace; integrated verification and owner review required.

## Status against v3

This initial implementation record is retained as history. Five roles and four
workstations now follow [ADR 0007](0007-five-role-hermes-and-office-migration.md).
Cards target the original desks or Orion's room center; character/name-tag
tracking, status labels, board, and controls follow the
[v3 requirements](../requirements/office-experience-v3-kantor-agent.md) and
[ADR 0008](0008-mobile-floating-ui-character-tracking-and-status-parity.md).
The selected Uji QA heading now displays the pending-approval count with an
explicit explanation; it does not prove a QA stage or result. Older references
to seven identities, six screens, character-following cards, and a visible
Fokus TV button are historical. Device time in Asia/Jakarta, actual snapshot
timestamps, privacy, and deployment boundaries remain applicable.

## Scope and delivery order

The owner requested implementation of T03 through T07 before the next browser
verification pass. This replaces the earlier per-slice review sequence. It does
not authorize a production restart or deployment. The cockpit remains read-only.

## Shared time

`office-clock.js` formats the device clock in `Asia/Jakarta`. The client samples
one snapshot per second and passes it to the analog clock, six workstation
screens, window colors, and the DOM clock. API `now` remains the ledger snapshot
time, not the source of the office clock. Offline status does not stop time.

Analog hands update on the second key; digital textures update on the minute or
status key. Exterior colors update on the minute key. Interior lighting remains
constant so the office stays legible at night. A DOM-only clock interval is used
only when the renderer is unavailable; there is no second scene render loop.

## Identity and illustration

Orion, Nova, Atlas, Lyra, Axiom, Vega, and Echo are owner-selected fictional agent
identities. Role keys, slugs, public status fields, and jobs do not change. The
canonical role palette supplies clothes, mugs, name tags, DOM identities, and
wallpaper. Skin tone and hair remain unchanged.

Each work screen has a different role schematic and a visible `Tampilan
ilustratif` label. Only public state and generic public summaries are shown.
Diagram motion indicates a working state, not real pipeline stages, model
progress, health, or evaluation results. Offline, waiting, idle, and failed
screens do not animate.

Wallpaper gradients identify a role; dark work screens distinguish work content
from the clock; desk props identify disciplines without adding fake activity.
Warm wood and white cabinets retain the approved studio direction. The dials
remain ENERGY 2, RHYTHM 2, MOTION 1.

## TV and camera

The TV is a local decorative canvas, not a streaming client or game. Empty sofa
seats show a fictional catalog with Netflix-style composition. Actual occupied
sofa seats show decorative racing. Reduced motion holds a static racing frame.
TV pointer selection and the DOM `Fokus TV` button only change the camera. They
do not start media or execute any runtime action.

Agent cards follow current character locations; desk clicks target workstation
locations. Manual orbit clears a preset. Resize preserves the selected preset.

## Task board

The shared projection uses only the existing public contract:

- Rencana: unavailable; queued is not planning.
- Dikerjakan: `queue.running`, which excludes expired leases.
- Uji QA: unavailable; role activity is not a QA stage.
- Selesai: `totals.completed`, representing succeeded tasks.
- Attention: queued, waiting approval, failed, and stale counts.

Missing or offline counts are unavailable, not zero. Scene and DOM use the same
mapping. The board is non-interactive; details remain in the existing queue panel.
No task payloads, private paths, code, vault documents, commands, or ledger writes
are introduced. This batch adds no API fields or dependencies.

## Verification boundary

The earlier 39-test result predates this batch and does not verify T03 through
T07. Build, unit/privacy tests, browser interactions, responsive screenshots,
reduced motion, asset failure, and the Antislop delivery gate must be recorded
against the integrated build before delivery or deployment. A headless ARM
browser is not a Chrome Windows 150% performance benchmark.
