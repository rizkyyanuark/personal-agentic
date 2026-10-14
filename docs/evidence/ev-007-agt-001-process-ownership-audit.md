# AGT-001 process ownership audit

Date: 14 October 2026 (Asia/Jakarta).
Source base: `ec70e3287682fdc3c6a86df03054a38fe6e92817`.
Checkout: `C:\Users\rizky\.codex\worktrees\agent-process-audit\personal-agentic`.
Branch: `codex/agent-process-audit`.
Contract: [AGT-001](../../openspec/changes/AGT-001-subagent-concurrency-and-process-guard/proposal.md).

## Conclusion

No missing process-group/Job ownership mechanism or reproducible bridge leak was
found. Existing source already covers owned-process termination and separate
main/side queues. The original acceptance wording confused live orphan processes
with exited zombies and applied a ten-second budget to a fifteen-second watchdog.
The corrected contract measures the identities belonging to a run and reports
transport-specific evidence.

## Production path mapped — Inspected

UI **Stop** in `src/frontend/src/App.tsx` posts `/runs/{id}/cancel`; the backend
route is `/api/runs/{id}/cancel` in `src/backend/src/api.rs`. `runtime::cancel`
persists queued/waiting cancellation immediately or signals the admitted run's
AtomicBool, cascades a coordinator stop to active delegates and emits
`run.cancel_requested`. The runtime accounts only active execution time, forwards
`cancel` to offloaded execution, and retains the explicit controller cause even
when the remote receipt acknowledges `cancelled`.

`remote_bridge.py::execute` uses `start_new_session=True`. `stop_group` sends
TERM, waits 0.2 seconds, sends KILL and waits for the direct child. Input EOF stops
execution; absence of controller heartbeats independently stops it after about
15 seconds. Natural leader exit also invokes group cleanup before draining
output. Native and worker Rust execution uses `OwnedProcessTree`; Unix holds the
leader unreaped with `waitid(..., WNOWAIT)` until group termination/revocation.
Windows assigns the suspended child to a kill-on-close Job before resuming it.
These Windows/worker descriptions are source inspection, not execution proof.

Queue conflicts always serialize the same session. Agent/workdir conflicts apply
within the same main/side queue; a distinct side session remains independent.
Explicit separate worktrees remain the owner's chosen practice for concurrent
writers. No universal directory lock was added.

Schema routing only processes successful coordinator runs, rejects self/duplicate
assignments, limits each decision to three targets and validates targets inside
one SQLite transaction. Cross-chat tools separately enforce one hop/three receipts;
summary/review mutation requests fail. This is not a general depth-three cap.
Authorized action-board invocations use the existing action permissions and
deduplication; the audit does not claim that they share cross-chat lineage limits.

## Real Unix bridge execution — Passed

Command:

```powershell
wsl -d Ubuntu-24.04 -u root -- python3 -B /mnt/c/Users/rizky/.codex/worktrees/agent-process-audit/personal-agentic/src/backend/tests/process_ownership.py
```

Environment: WSL Ubuntu 24.04, Linux `/proc`, Python 3, actual `/bin/sh`, Git.
No production host was contacted. The regression executes the unchanged bridge
`main` entrypoint, including real workspace validation, subprocess spawn, control
input, output drain, TERM/KILL, direct-child reaping and JSON completion receipt.
A disposable HOME/workdir avoids native credentials and existing platform state.
A Codex discovery fixture supplies an unavailable external CLI boundary; it exits
97 if executed. The terminal operation executes the actual shell, so there are
zero provider calls and no mocked process or signal mechanism.

Each fixture has a long-running child in its captured PGID. The test records
PID, PGID and `/proc` start ticks, checks for disappearance/exited state using
that identity, and keeps an unrelated real process group alive throughout.
The test harness alone enables Linux child subreaping so its adopted fixture
children can be reaped without leaving test zombies on WSL. Production bridge
ownership is not patched or monkeypatched.

| Scenario | Receipt | Seconds from observed trigger | Group / captured PIDs | Outcome |
|---|---|---:|---|---|
| Explicit cancel | `cancelled`, exit 1 | 0.215 | 381 / 381, 389 | Both stopped; unrelated group alive |
| One-second execution timeout | `timed_out`, exit 1 | 1.170 | 393 / 393, 401 | Both stopped; unrelated group alive |
| Input EOF | `interrupted`, exit 1 | 0.215 | 405 / 405, 413 | Both stopped; unrelated group alive |
| No heartbeat with input open | `interrupted`, exit 1 | 15.215 | 417 / 417, 425 | Both stopped; unrelated group alive |
| Leader exits while child remains | null status, exit 0 | 0.415 | 434 / 434, 442 | Both stopped; unrelated group alive |

Final output:

```json
{"status":"passed","scenarios":5,"source_sha256":"c4c343d4f68219b8701868aae5e2c3f2e73a017d0b61e45b9ce18a2f9b03248c","process_mocks":0,"provider_calls":0,"cli_fixture":"discovery only; execution fails","production_contacted":false}
```

All direct group leaders were already gone. Each child was exited (`Z`) before
reaping by its newly assigned test parent. A zombie cannot execute or consume CPU;
its temporary presence does not establish an orphan leak. Searching all host
process names or all host zombies would also mix unrelated runs into the result.

## Pending candidate-app checks

The dedicated checkout had no installed Rust toolchain, running candidate service,
native Windows JobObject execution or registered worker at this first audit.
Existing SQLite integration tests must be executed during consolidated candidate
verification: `side_chats_isolate_sessions_context_queues_and_reset` and
`routing_validates_targets_and_rolls_back_partial_handoffs`. Browser/HTTP Stop,
real SSH transport and registered-worker parity remain distinct checks until
that verification records outputs. No claim of full transport acceptance is made.

Final regression rerun after strengthening pre-trigger liveness validation: five scenarios passed again; bridge SHA256 unchanged.
