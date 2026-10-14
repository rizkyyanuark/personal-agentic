# Tasks: AGT-001 — concurrency and process ownership audit

[Proposal](proposal.md) | [Verification](verification.md).

- [x] T3-1: map UI Stop → authenticated cancel API → persisted cancellation flag →
  native/remote process ownership; record the independent timeout/watchdog paths.
  Source inspection is labelled `Inspected` rather than runtime acceptance.
- [x] T3-2: exercise the production Unix bridge entrypoint with actual parent/child
  processes for cancel, timeout, stdin EOF, heartbeat stall and a completed leader
  leaving a child. Check exact PID/PGID/start-time identities and preserve an
  unrelated process group. Use an isolated disposable HOME/workdir.
- [ ] T3-3: run `side_chats_isolate_sessions_context_queues_and_reset` against the
  real SQLite-backed API submission path. Preserve main/side parallelism and same-session serialization.
- [ ] T3-4: run `routing_validates_targets_and_rolls_back_partial_handoffs` against
  actual persisted queue/session state; inspect separate one-hop cross-chat and
  summary/review guards without claiming a general three-level recursion limit.
- [ ] T3-5: consolidate candidate-app verification and any available native Windows,
  actual SSH and registered-worker execution. Record unavailable paths honestly;
  fix production code only if a reproducible ownership/routing defect is found.

Commands from the repository root:

```sh
python3 -B src/backend/tests/process_ownership.py
cd src
cargo test -p agentic-enterprise --locked side_chats_isolate_sessions_context_queues_and_reset
cargo test -p agentic-enterprise --locked routing_validates_targets_and_rolls_back_partial_handoffs
```

The bridge regression requires Linux `/proc`, Python 3.11+ and Git. It makes no
provider request and performs no production-host operation. Its discovery-only
Codex fixture exits with failure if invoked. The process mechanism, bridge
entrypoint, real shell, child processes, signals and receipts are not mocked.
