# Verification: AGT-001 — concurrency and process ownership audit

[Proposal](proposal.md) | [Tasks](tasks.md) |
[Detailed evidence](../../../docs/evidence/ev-007-agt-001-process-ownership-audit.md).

Base commit: `ec70e3287682fdc3c6a86df03054a38fe6e92817`.
Date: 14 October 2026 (Asia/Jakarta).

| Requirement/path | Evidence | Outcome |
|---|---|---|
| REQ-AGT-001-1, explicit bridge cancel | Real PGID, parent/child identity, completion receipt; 0.215 s | Passed |
| Active timeout | One-second timeout; `timed_out`, 1.170 s | Passed |
| Controller input EOF | `interrupted`, 0.215 s | Passed |
| Heartbeat stall | Open input without heartbeat; `interrupted`, 15.215 s | Passed |
| Completed leader with child | Exit 0; lingering child stopped, 0.415 s | Passed |
| Unrelated process isolation | Separate real process group alive in all five scenarios | Passed |
| Native Unix/Windows process owner and worker path | Production spawn/resource/runtime/fleet source | Inspected |
| REQ-AGT-001-2 main/side and same-session serialization | Existing SQLite integration test identified | Not run: candidate Rust toolchain/build pending |
| REQ-AGT-001-3 coordinator rollback/limits | Existing SQLite integration test identified | Not run: candidate Rust toolchain/build pending |
| One-hop cross-chat, summary/review guards | Production tool and coordinator code | Inspected |
| Browser Stop/authenticated HTTP cancellation | UI/API/runtime source mapping only | Not run: candidate app proof pending |
| Actual SSH transport/native Windows/registered worker | Different transport/OS than local Unix regression | Not run: no claim of transport parity |

Five scenarios passed through the unmodified production bridge CLI. This proves
local Unix bridge ownership behavior; it does not replace candidate-app HTTP,
Windows JobObject or registered-worker proof. No production ownership/routing
change was necessary from these observations. A transient exited descendant was
observed as `Z` before the test-only Linux subreaper reaped it; it was not executing
and did not count as a live orphan. The direct leader was already gone.
