# AGT-001 process ownership audit

Date: 14 October 2026 (Asia/Jakarta).
Source base: `ec70e3287682fdc3c6a86df03054a38fe6e92817`.
Checkout: `C:\Users\rizky\.codex\worktrees\agent-process-audit\personal-agentic`.
Branch: `codex/agent-process-audit`.
Contract: [AGT-001](../../openspec/changes/AGT-001-subagent-concurrency-and-process-guard/proposal.md).

## Conclusion

Existing process-group/Job ownership stops the run's executing descendants and
preserves independent work. A later real native Terminal API audit found a separate
container reaping defect: with no init process, an adopted child remained a zombie
under the Rust application as PID 1. One production configuration line,
`platform.init: true`, fixes that reproduced case. The same immutable backend image
with Docker init reaped both captured process identities while independent work
continued. Queue and routing behavior were preserved.
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

## Initial toolchain and transport limitations

The dedicated checkout had no installed Rust toolchain, running candidate service,
native Windows JobObject execution or registered worker at this first audit.
Existing SQLite integration tests must be executed during consolidated candidate
verification: `side_chats_isolate_sessions_context_queues_and_reset` and
`routing_validates_targets_and_rolls_back_partial_handoffs`. Browser/HTTP Stop,
real SSH transport and registered-worker parity remain distinct checks until
that verification records outputs. No claim of full transport acceptance is made.

Final regression rerun after strengthening pre-trigger liveness validation: five scenarios passed again; bridge SHA256 unchanged.

## Native candidate API and container reaping — reproduced and fixed

Candidate backend identity was inspected directly: immutable image
`registry.tugasakhir.space/rizkyyanuark/personal-agentic/platform@sha256:84cae56460603822e5eee645c634fcc64f7c125ca108b6259f5f800aa2c4cf9e`,
OCI revision `ec70e3287682fdc3c6a86df03054a38fe6e92817`.
The first API candidate used CAT's new frontend distribution, but this proof
exercised unchanged native Terminal API/process ownership, not CAT backend behavior.
The later init fixture used the image's original frontend and backend.

The real API regression signs in with a private candidate key file, creates its
own paused profiles and distinct local workdirs, and starts two explicit shell
commands. It records actual PID, PGID and `/proc` start ticks. Anonymous Stop fails
with HTTP 401. Stop under the wrong agent fails with HTTP 400 and leaves the run
active. An authenticated correct Stop persists `cancelled` and `ended_at`; the
other command keeps streaming. A subsequent local API command reads only the
captured process identities to verify reaping and unrelated process liveness.
Audit commands finish and the audit profiles are archived afterwards.

### Baseline — Failed container reaping, successful owned execution stop

On `personal-agentic-cat-acceptance-20261014`, Stop finished in 1.516 seconds.
The run was `5e1ffc56-143c-4876-a28d-6b51dcbc1d8e`; independent run
`556728ad-338f-40bc-bc04-75f30ff831a7` remained running and streamed further output.
Parent 649 was gone. Child 652 was exited (`Z`), with captured start ticks
207217284. A later read-only admin check, several minutes after Stop, confirmed
that exact identity still existed as `Z`, PPID 1, in the same container:

```json
{"init":null,"pid1_command":"agentic-enterpr","captured_child":{"pid":652,"state":"Z","ppid":1,"start_ticks":207217284,"identity_matches_api_proof":true}}
```

This proves a retained adopted-child zombie in the container, rather than a live
orphan or a global host process-name count. The application's process owner reaps
its direct child, while the application acting as container PID 1 did not reap
that adopted descendant. The initial WSL bridge test's test-only subreaper had
correctly cleaned fixture descendants; that alone did not prove container PID 1 behavior.

### Minimal fix and actual regression — Passed

`infra/production/compose.yaml` now enables `init: true` only for the platform
service. Docker's init becomes PID 1, forwards signals and reaps adopted children;
this is the documented [Compose init behavior](https://docs.docker.com/reference/compose-file/services/#init).
No process registry, host-wide cleanup or concurrency cap was added.

A fresh isolated fixture, `personal-agentic-agt-init-proof-abe7ecf2`, used the same
immutable image, `--init`, 256 MiB RAM/no swap, 0.25 CPU and `/data`/`/workdir` tmpfs.
It mounted no production SSH key, credentials or persistent volumes. A synthetic
custom Codex catalog supplied metadata through the normal parser solely to validate
the paused profiles. No native provider executable or agent turn was invoked;
actual shell processes, auth, API routing, SQLite terminal rows and Unix ownership
were exercised.

Command (owner file was private and deleted after fixture cleanup):

```sh
python -B src/backend/tests/terminal_process_ownership.py --url http://127.0.0.1:18770 --owner-file org/.state/verification/terminal-process-ownership-init/owner.key --workdir /workdir/catalog-acceptance --model agt-fixture-primary --reasoning medium --require-reaped-child
```

Actual output:

```json
{"status":"passed","stop_seconds":1.500,"stopped_run_id":"40ebff07-f89b-466e-8a1a-453780402c28","stopped_state":"cancelled","unrelated_run_id":"dc4abb68-4c3a-4d78-9bf2-29494e20f78b","unrelated_state":"running","unrelated_output_grew":true,"owned_identities":{"leader_pid":55,"child_pid":58,"pgid":55,"leader_ticks":207285208,"child_ticks":207285208},"unrelated_identities":{"leader_pid":65,"child_pid":68,"pgid":65,"leader_ticks":207285378,"child_ticks":207285378},"observed_states":{"leader":"gone","child":"gone","control":"S"},"unauthenticated_stop_http":401,"cross_agent_stop_http":400,"agent_turns":0,"provider_calls":0,"cleanup":"all audit terminal runs finished; audit profiles archived"}
```

Real Docker Compose rendered the changed production file using fixture environment
values without starting any production service. The rendered platform had `init`
true, the same digest-pinned image, and unchanged Matrix init configuration.
The init fixture was inspected as non-OOM, with no persistent mounts, and then
stopped/automatically removed. An immediate removal assertion initially raced
Docker's asynchronous auto-removal; a bounded follow-up confirmed the exact owned
container was absent. Final render/removal verification output was:

```json
{"compose_platform_init":true,"compose_matrix_init":false,"compose_image":"registry.tugasakhir.space/rizkyyanuark/personal-agentic/platform@sha256:84cae56460603822e5eee645c634fcc64f7c125ca108b6259f5f800aa2c4cf9e","fixture_removed":true,"rendered_only":true}
```

The production container was not restarted during this audit. The Compose change
requires the normal reviewed container recreation/deployment. Consolidated backend
CI still needs to record the two real SQLite queue/routing regression outputs.
Agent-run browser Stop, native Windows and registered-worker execution remain
separate unexecuted paths, not inferred success from this Linux Terminal proof.
## Corroborated SQLite acceptance — 14 October 2026

Read the actual backend job255 trace of pipeline61 on ec70e328:
side_chats_isolate_sessions_context_queues_and_reset and
routing_validates_targets_and_rolls_back_partial_handoffs both `ok`;
145 tests passed, 0 failed, 0 ignored in8.07s. No test-system mock replaces the
SQLite store; provider execution is outside those queue tests.

`git rev-parse HEAD:src/backend/src ec70e328:src/backend/src` returned the same
tree twice: `8040149be0f51a92355bab770982e2839a69a726`. This change modifies only
container init and Python/browser proof, not Rust/Cargo/schema behavior. This
accepts those unchanged controls on their exact source identity; the integrated
MR still runs the latest branch's full backend CI separately.
