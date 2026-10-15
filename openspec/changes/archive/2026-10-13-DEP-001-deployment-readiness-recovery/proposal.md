# DEP-001 — Deployment readiness and guarded recovery

## Identity and baseline

Issue: [GitLab #3](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/3).
Owner: Codex coordinator; accepted by the product owner on 12 October 2026.
Checkout: `C:/Users/rizky/.codex/worktrees/8d30/personal-agentic`.
Branch: `codex/deployment-readiness-recovery`; base `47a74a051f4e9c34a947be11f9565c78e78648d7`.
The checkout was clean before this change; other checkouts and production state are preserved.

Pipeline47/job188 failed with `ConnectionResetError` while verifying a newly started candidate.
The candidate subsequently passed real application smoke and retained the original state.
A reviewed one-off recovery finalized the journal; ordinary retry189 passed without another restart.
The existing helper retries health but omits some transient transport errors, and has no recovery action.

## Result and scope

Provide bounded startup readiness and a restricted, identity-bound `recover` action for an already-running candidate.
Preserve the existing image, backup, schema, authentication and application checks.
Make interrupted release-journal finalization replayable without replacing data or services.

Minimum files: `infra/production/release.py`, focused tests in `infra/production/tests`,
the existing `production_config` CI job, `docs/deployment.md`, and this contract.
Production code is owned by the coordinator; the test file is assigned to an independent implementer.

Non-goals: automatic image rollback/database restore, schema migration, provider upgrades,
changing the active image during recovery, or enabling unconditional automatic deployment.
The deployment identity cannot replace its own root helper; installation remains a separately reviewed administrator action.
This request authorizes implementation, tests and a Draft MR. Merge and production-helper installation await review of the concrete result.

## Owner decision: phased automatic deployment

The owner selected phased automation: review and merge stay with the owner;
routine deployment should become automatic after technical gates are proven;
data/auth/infrastructure changes and risky recovery remain manual.
DEP-001 establishes the readiness/recovery foundation and retains the current manual production job.
A subsequent change must prove atomic admission/drain for runs, scheduler, terminals and indexing,
capacity checks, outdated-release handling and risk classification before activating routine auto-deploy.
Green image smoke alone does not prove native provider execution or restore compatibility.

## Requirements and scenarios

### DEP-R1 — Bounded startup readiness

GET health retries transient connection reset/disconnect, incomplete read and network timeout within a monotonic startup budget.
Each request timeout is bounded by the remaining budget. Success requires the existing healthy JSON payload.
Auth, UI, schema and asset failures remain failures; login/logout operations are not blindly replayed.

- Healthy service responds immediately: continue to the existing full smoke.
- Real TCP reset followed by healthy service: retry and succeed within the budget.
- Persistent transport failure or invalid health: stop with a sanitized readiness error.

### DEP-R2 — Explicit candidate identity and safe recovery

`recover` requires the same fixed-repository digest, full commit and source SVG hash as the requested candidate.
Under the existing release lock, the configured image, actual running platform image ID/revision,
Linux ARM64 registry metadata and pending/current/previous journal must agree.
Only a pending promotion with a verified predecessor is supported.
The current record may be the predecessor or this exact candidate transaction after partial finalization.
A later or unrelated transaction, pending rollback, missing predecessor, or mismatched identity is refused.

- Matching failed candidate: inspect, verify, then finalize without pull, restart, image replacement or DB restore.
- No pending and matching verified current candidate: repeat full smoke and return unchanged.
- Wrong digest/commit/SVG, stale journal or different container: refuse and preserve existing records.

### DEP-R3 — Backup, state and smoke gates

Recovery requires no queued/running/waiting operation and unchanged schema fingerprints.
Its stopped backup must be contained under the fixed backup directory, root-owned/private/non-symlink,
with the exact four expected archive names, verified SHA256 hashes, predecessor image and original schema.
Repeat quiet/schema and running-image checks after the existing full smoke before finalization.
Missing/corrupt/redirected backup, active work, schema drift, lock contention or smoke failure refuses recovery.

### DEP-R4 — Durable and idempotent journal finalization

Retain failed-journal evidence privately under a deterministic name.
Persist the verified pending transaction before writing previous/current records;
remove pending only after those writes and sync the release directory.
Recovery accepts interruptions after previous/current writes only for that same transaction.
Unknown or conflicting records fail clearly; no failed error field is presented as current success.

### DEP-R5 — Real verification and rollout boundary

Tests exercise actual HTTP transport and filesystem/SQLite interfaces; no internal module mock substitutes for wiring.
Use a real app health endpoint through a bounded transport-fault fixture where feasible.
Exercise the candidate CLI's idempotent recovery against the existing verified installation without rewriting production journals.
Failed-journal mutations use isolated directories, not invented failed production records.
Record which contract scenarios and real dependencies ran; do not claim the new installed helper or auto-deploy policy is active before installation.

## Design and risks

Keep the existing typed stdin, fixed paths/repository, root ownership, server flock,
restricted SSH identity and existing smoke function. Extract explicit validation and finalization seams,
with physical-file arguments for isolated contract checks. There is no new persistence subsystem.
Transport retry is scoped to startup health. Recovery trusts matching journal and verified runtime facts,
not a caller-supplied healthy flag. Partial journal writes are reconciled only using the pending predecessor.
Image rollback cannot reverse database/data migrations and is outside this automatic recovery path.

See [tasks](tasks.md) and [verification](verification.md).
