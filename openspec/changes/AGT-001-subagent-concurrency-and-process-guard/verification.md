# Verification: AGT-001 — concurrency and process ownership audit

[Proposal](proposal.md) | [Tasks](tasks.md) |
[Detailed evidence](../../../docs/evidence/ev-007-agt-001-process-ownership-audit.md).

Base backend commit: `ec70e3287682fdc3c6a86df03054a38fe6e92817`.
Date: 14 October 2026 (Asia/Jakarta).

| Requirement/path | Evidence | Outcome |
|---|---|---|
| REQ-AGT-001-1, explicit bridge cancel | Real PGID, parent/child identity, completion receipt; 0.215 s | Passed |
| Active timeout | One-second timeout; `timed_out`, 1.170 s | Passed |
| Controller input EOF | `interrupted`, 0.215 s | Passed |
| Heartbeat stall | Open input without heartbeat; `interrupted`, 15.215 s | Passed |
| Completed leader with child | Exit 0; lingering child stopped, 0.415 s | Passed |
| Unrelated bridge process isolation | Separate real process group alive in all five scenarios | Passed |
| Native Unix owner through real Terminal API | `cancelled`/end time persisted; distinct command continued streaming | Passed |
| HTTP authentication/terminal ownership | Anonymous Stop 401; wrong-agent Stop 400 without changing the run | Passed |
| REQ-AGT-001-4 baseline container reaping | Captured child 652/start_ticks 207217284 remained Z under PPID 1; no Docker init | Failed: reproduced container configuration defect |
| REQ-AGT-001-4 fixed container | Same immutable image with Docker init: leader 55 and child 58 gone; control 65 sleeping and streaming | Passed: Stop 1.500 s |
| Production Compose configuration | Real `docker compose config --format json`: platform init=true; Matrix unchanged | Passed |
| Native Windows owner and registered-worker path | Production spawn/resource/runtime/fleet source | Inspected; transport execution not run |
| REQ-AGT-001-2 main/side and same-session serialization | Actual pipeline61/job255 trace; unchanged Rust tree | Passed on ec70 baseline; latest MR CI remains a separate gate |
| REQ-AGT-001-3 coordinator rollback/limits | Actual pipeline61/job255 trace; unchanged Rust tree | Passed on ec70 baseline; latest MR CI remains a separate gate |
| One-hop cross-chat, summary/review guards | Production tool and coordinator code | Inspected |
| Browser/HTTP agent-run Stop | Different endpoint from the exercised Terminal API | Not run: no agent/provider turn executed |
| Actual SSH runtime/native Windows/registered worker execution | Different transport/OS from local Unix regression | Not run: no claim of transport parity |

Initial Unix bridge execution showed no live orphan. The later native-container
API audit found a separate reaping defect: an adopted child stayed exited (`Z`)
under the Rust application acting as PID 1. Adding Docker init to the platform
service fixed that exact case without changing queue, routing or process ownership
code. The isolated init fixture used 256 MiB RAM, no swap, 0.25 CPU and tmpfs;
it made no provider request, mounted no production key or persistent volume,
and was removed after proof. The running production service was not restarted;
this configuration takes effect when the reviewed release recreates its platform container.
