# DEP-002 — deployment drain

Historical contract: the owner requested removal of this feature in [CI-003](../2026-10-14-CI-003-simple-automatic-releases/proposal.md). Evidence below describes DEP-002 at its recorded revision, not the current release procedure.

## Identity, baseline and authorization

Issue: [GitLab #4](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/4).
Owner: Codex coordinator; scope accepted by the product owner on 12 October 2026 by requesting continuation of the previously explained implementation through commit, push and Draft MR.
Checkout: `C:/Users/rizky/.codex/worktrees/8d30/personal-agentic`.
Branch: `codex/deployment-drain`; canonical protected main baseline `18f4dfb4b3b07451cbca5520de6c389fe9a2ed34`.
The clean DEP-001 branch at `98dcc38` and other checkouts are preserved. DEP-001 source was merged and its root helper installation accepted in Issue #3; the application image remains a separate release identity.

The owner selected a maximum 15-minute drain wait. Merge, first production bootstrap, root-helper installation and routine auto-deploy activation require review of their concrete results; they are not performed by this implementation task. The current CI production job remains manual.

## Problem and result

The release helper checks existing operations before shutdown, but new requests or schedules can enter after that check. Service restart interrupts queued runs, questions, terminals and indexing. A manual quiet window mitigates this race but does not close application admission atomically.

Before replacing the application, close admission across all workspaces, finish already accepted work including continuations, then seal the installation. A pre-upgrade wait timeout reopens admission without cancelling existing work. A sealed installation stays closed across restart until the same deployment owner verifies the release and resumes admission.

## Scope and minimum file set

Reuse the existing Rust controller, SQLite transaction/queue, authenticated routing, root release helper, events and React notice/error patterns. No new provider or runtime dependency.

Backend: `main.rs`, `platform.rs`, `store.rs`, a focused `drain.rs`, `model.rs`, `security.rs`, admission paths in `api.rs`, `matrix.rs`, `schedules.rs`, `actions.rs`, `coordination.rs`, `agent_tools.rs`, `runtime.rs`, `terminal.rs` and `fleet.rs`, plus real-store/router tests, a sanitized native summary fixture and generated bindings.
UI: existing App composer/notice, terminal, ActionBoard and knowledge/index controls; preserve read/answer/cancel paths and drafts.
Release: `infra/production/release.py`, focused physical HTTP/filesystem tests, existing CI job/image labels, Dockerfile, executable real-app smoke and release runbook.

Non-goals: automatic merge or routine auto-deploy, automatic cancellation of accepted work, database restore, automatic image rollback, provider upgrades, server relocation, a second scheduler, or zero-downtime infrastructure. A single-instance stop/backup/recreate release still has a service gap after drain.

## Requirements

### DEP2-R1 — global atomic admission

One gate is shared by every loaded workspace and new workspace. Closing it is atomic with transactions admitting roots; asynchronous admitted operations carry an owned permit until their real work and cleanup finish. Root requests fail clearly with HTTP 503 during maintenance. Known idempotent replay may return existing records without starting new work.

The existing `enabled` dispatcher toggle is not used: queued accepted work must run. Root requests from HTTP/Matrix, due schedules/actions, terminal, indexing and remote inspection are gated. Continuations from actual accepted runs, including delegation, summary, review and cross-chat handoff, remain allowed during drain and cannot be enabled by caller-supplied lineage alone.

- Begin races a new request: the request either commits as accepted work counted by drain or is rejected before admission.
- A second workspace or asynchronous file/remote operation cannot escape seal counting.
- No new workspace may start an unregistered queue after seal.

### DEP2-R2 — accepted work and scheduling integrity

Drain counts queued/starting/running/waiting runs, terminal execution, indexing, remote jobs, undelivered accepted continuations and in-flight operations. Schedules and scheduled actions defer without advancing claims or becoming disabled/failed. Existing questions can be answered, accepted work cancelled explicitly, and results delivered. Run/provider/terminal permits last through cleanup, not only the terminal DB status write.

- Accepted queue, delegate and parent summary complete during drain.
- A due schedule/action stays intact and dispatches through the normal claim path after reopening, without duplication.
- A human-answer wait blocks seal and survives drain timeout.

Real SSH Antigravity acceptance found a collector defect: the resumed summary's
SUCCESS frame contained the correct current `response` and stale coordinator
`structured_output`. The collector previously published the stale routing JSON.
For Summary runs only, collect the nonempty current response and fail clearly if
it is missing; Coordinator routing retains its existing structured-output behavior.
This narrow correction is required to deliver the accepted continuation's result.

### DEP2-R3 — bounded ownership and restart

Control protocol version 1 is global at `GET/POST /api/deployment-drain`, using the existing bootstrap-owner bearer credential and host/origin checks. Workspace ownership/member login alone does not grant controller-wide maintenance control. Typed requests reject unknown fields. Public StateView exposes only maintenance phase and deadline, not an ownership capability.

Transitions: `open -> draining -> sealed -> open`. Begin has a validated UUID generation and timeout 1..900 seconds; production helper always chooses 900. Same-generation replay is idempotent; another generation cannot take ownership. Draining expiry opens admission; sealed state has no automatic expiry and is loaded before queue startup. Seal requires the same generation and zero global blockers while admissions cannot race it. Resume requires the same generation.

### DEP2-R4 — reviewed helper lifecycle

Prepare/pull/inspect the candidate and verify the predecessor before closing admission. The fixed root helper holds its existing release lock, writes a private owned lease before begin, waits at most 900 monotonic seconds, seals, rechecks database/schema/runtime, then uses its existing stop/backup/start/smoke/finalization path. Persist generation and source/candidate identity before stopping services.

Before shutdown, failure may reopen only the verified owned generation. After partial shutdown or failed candidate verification, preserve sealed ownership, pending evidence and backups for explicit recovery. Successful release/recovery verifies the exact candidate and resumes the owned generation; no blind database restore. Foreign or missing ownership fails closed.

Target images carry `space.tugasakhir.personal-agentic.deployment-drain-protocol=1`; normal guarded promotion/rollback refuses an incompatible image before shutdown. Protocol absence/404 never selects an implicit bypass. Production CI remains manual; its timeout accommodates the 15-minute drain and existing bounded preparation/backup commands.

### DEP2-R5 — visible behavior and real proof

UI displays nondismissible maintenance status using existing notice styling. New sends, terminal execution, immediate actions and indexing are disabled consistently with backend policy; drafts, history, previews, answers and Stop remain usable. Races still surface the backend error and preserve drafts.

Prove auth, multiple workspaces, admission race, queued/continuation completion, scheduler deferral, timeout, sealed restart, wrong generation, new-terminal/index rejection, existing operation completion and UI states against real application wiring. Helper transport faults use physical HTTP fixtures; destructive Docker effects may be boundary fixtures only with stated limits. Provider continuation acceptance must use a real provider before claiming that runtime proof. CI and smoke results belong to their tested revisions.

## Design and rollout boundary

Keep lock order gate -> workspace registry -> store; do not hold a process read lock across async await or acquire a nested gated transaction. Use a durable record in the existing controller state volume, with private atomic/fsynced writes and owned async permits. No database or independent orchestration service is introduced.

Old production app47 does not support this protocol. The first image must be deployed in a separately reviewed quiet window using the already installed DEP-001 helper, retaining that bootstrap's known admission-race limitation. Verify the new API and sealed restart persistence, then install the reviewed new helper. There is no CI `skip_drain`. Older incompatible rollback images require separate reviewed compatibility handling and are rejected by the guarded helper.

## References and provenance

The implementation extends this application's existing Paperclip-derived claims/exec queue and CCCC-derived process ownership, as recorded in `src/UPSTREAM.md`. [CCCC's upstream control-plane/lifecycle documentation](https://github.com/ChesterRa/cccc) retains daemon-owned durable state and process ownership across crashes. [Paperclip's heartbeat service](https://github.com/paperclipai/paperclip/blob/master/server/src/services/heartbeat.ts), inspected on 12 October 2026, separates lifecycle, run control, queue and recovery. These are precedents for preserving lifecycle/ownership boundaries; neither source is claimed to provide this application's deployment-drain protocol. Existing scheduler claim adaptation remains pinned in UPSTREAM; the attempted live fetch of that older routine revision was unavailable, so no new claim is derived from it.

[GitLab deployment safety](https://docs.gitlab.com/ci/environments/deployment_safety/) supplies sequential deployment/protected-credential guidance. Existing resource_group and server lock are preserved; they do not replace application admission or establish a host budget across projects.

See tasks and verification for acceptance evidence; GitLab Issue owns the current phase.
