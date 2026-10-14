# Proposal: AGT-001 — concurrency and process ownership audit

Change ID: `AGT-001-subagent-concurrency-and-process-guard`.
Decision: [ADR 0003](../../../docs/decisions/0003-subagent-concurrency-and-process-guard.md).
Evidence: [AGT-001 process audit](../../../docs/evidence/ev-007-agt-001-process-ownership-audit.md).

## Problem and intended result

The initial proposal assumed process ownership and delegation controls were absent.
The production code already implements them. This change verifies those controls
and fixes only a reproduced defect. Main and side chats keep their independent
sessions and can run concurrently. Concurrent writers use explicitly selected
separate worktrees when needed; the platform does not create worktrees automatically.

The owner selected this scope on 14 October 2026. This is an audit contract, not a
new host-wide concurrency limit. GitLab owns work status; verification records
which execution paths were actually exercised.

## Existing behavior

- `src/backend/src/remote_bridge.py` starts a Unix session/process group, sends
  TERM followed by KILL, reaps its direct child and publishes a completion receipt.
- `src/backend/src/process_tree.rs` and `process_tree/{spawn,resource}.rs` own
  native/worker processes. Unix keeps the group leader unreaped until ownership
  is revoked; Windows assigns a suspended child to a kill-on-close Job before resume.
- `src/backend/src/runtime.rs` persists run state, receives explicit cancellation,
  excludes human-question waiting time from execution timeout, and preserves main/side queues.
- `src/backend/src/coordination.rs` admits schema delegation only from a successful
  coordinator, rejects self/duplicate assignments and validates all targets transactionally.
- `src/backend/src/agent_tools.rs` limits cross-chat requests to one hop and three
  receipts per run; summary/review runs cannot create another invocation.

## Requirements

### REQ-AGT-001-1: stop only the owned processes

Given a running bridge command with a non-detached child in the same PGID, when
explicit cancellation, active execution timeout or input EOF is observed, then
both captured process identities stop executing, the direct child is reaped,
the receipt retains the terminal cause, and an unrelated process group continues.
Explicit cancellation/EOF should finish within ten seconds in the local Unix
bridge regression. A stalled heartbeat has a separate approximately fifteen
second watchdog, as specified in the PRD; it is not a ten-second guarantee.

Process identity evidence records PID, PGID and start time. An exited zombie is
not an executing orphan: the bridge can reap its direct child; the OS parent
reaps adopted descendants. Global `ps | grep agy` or a host-wide zero-zombie count
cannot establish run ownership. Deliberately detached daemons remain outside the
existing stop boundary.

### REQ-AGT-001-2: preserve legitimate parallelism

Given main and side chats for the same agent, when each submits work, then their
native session identities differ and their queues do not conflict. A second run
in the same session remains serialized. This audit does not introduce a universal
folder lock, fixed host-wide run cap, or automatic worktree creation.

### REQ-AGT-001-3: preserve explicit routing limits

Given a coordinator result, self, duplicate, fourth or invalid/unavailable targets
must fail without partial persisted dispatch. A valid target creates a delegate
with its parent run. Summary/review results cannot start schema delegation;
cross-chat recipients cannot relay another cross-chat invocation. The limit of
three assignments is breadth per coordinator result, not a three-level depth cap.
Explicit authorized action-board invocations follow their existing permissions
and are not silently reclassified as cross-chat handoffs.

## Scope and non-goals

Audit native, SSH bridge and registered-worker ownership paths; run real process
regressions on feasible transports; run existing SQLite queue/routing regressions.
Report transport limitations explicitly. No new process registry, heartbeat
daemon, global lock, speculative recursion guard, provider retry or host-wide
process cleanup is introduced without a reproduced failure.
