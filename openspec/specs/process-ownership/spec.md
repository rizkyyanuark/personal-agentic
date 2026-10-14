# Process ownership

## Purpose and baseline

Retrospective baseline recorded on 14 October 2026 from the existing application
controls and accepted [AGT-001 audit](../../changes/archive/2026-10-14-AGT-001-subagent-concurrency-and-process-guard/proposal.md).
[AGT-001 evidence](../../../docs/evidence/ev-007-agt-001-process-ownership-audit.md)
separates inspected transport code, executed process/API checks and SQLite queue
regressions. Platform Docker init is verified on a candidate using the same
immutable application image; activation in a new production release is separate.

## Requirements

### Requirement: Cancellation targets the owned process tree

Stop SHALL use authenticated, run-owned cancellation and persist its terminal
state. The Unix bridge SHALL stop captured non-detached leader/child identities
for explicit cancel, execution timeout or input EOF, reap its direct child and
retain the terminal cause. Its heartbeat watchdog SHALL remain independent.
Unrelated process groups SHALL continue executing.

#### Scenario: A local terminal command is stopped

- **WHEN** its authorized owner cancels that command through the application API
- **THEN** cancellation persists and its owned process tree stops while an unrelated command continues

#### Scenario: A caller does not own the terminal run

- **WHEN** an anonymous or wrong-agent request attempts Stop
- **THEN** the API rejects it and does not cancel the target command

#### Scenario: Bridge input or heartbeat disappears

- **WHEN** stdin closes or the heartbeat watchdog expires
- **THEN** the bridge stops its owned process group and records the corresponding terminal cause

### Requirement: Platform init reaps adopted descendants

The production platform Compose service SHALL enable Docker init. After its owned
local terminal tree is stopped, the captured adopted child SHALL be reaped rather
than retained indefinitely as a zombie. This requirement SHALL remain scoped to
the captured run identities rather than a host-wide zero-zombie assertion.

#### Scenario: A child outlives its direct parent during cancellation

- **WHEN** Docker init adopts that stopped descendant
- **THEN** the captured leader and child identities disappear while unrelated work remains active

### Requirement: Legitimate queue parallelism and routing remain intact

Main and side chats SHALL retain independent native sessions and queues, including
parallel work for the same agent/workdir; same-session work SHALL remain serialized.
Delegation SHALL validate permitted targets before persisted dispatch and reject
self, duplicate, fourth or invalid targets without partial handoffs. Summary/review
and cross-chat relay guards SHALL retain their existing restrictions.

#### Scenario: Main and side chats submit work

- **WHEN** the same agent receives work in the independent chats
- **THEN** their session/queue identities remain independent while a second run in one session is serialized

#### Scenario: A coordinator returns invalid targets

- **WHEN** the assignment list fails routing validation
- **THEN** no partial delegate dispatch is persisted

## Verified boundary

Real Linux bridge parent/child mechanisms, local Terminal API Stop/auth/ownership
and candidate Docker-init reaping are exercised. Actual pipeline 61/job 255 ran
the unchanged SQLite queue/routing source; the integration MR repeats the backend
gate. Native Windows, registered-worker Stop, SSH provider execution and browser
agent Stop are inspected or unexecuted paths, not verified transport parity.
Deliberately detached daemons remain outside the process-group stop boundary.
Explicit worktrees can isolate concurrent writers; this capability adds no global
folder lock, fixed host-wide concurrency cap or automatic worktree creation.
