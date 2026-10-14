# Tasks: AGT-001 — concurrency and process ownership audit

[Proposal](proposal.md) | [Verification](verification.md).

- [x] T3-1: map UI Stop → authenticated cancel API → persisted cancellation flag →
  native/remote process ownership; record the independent timeout/watchdog paths.
  Source inspection is labelled `Inspected` rather than runtime acceptance.
- [x] T3-2: exercise the production Unix bridge entrypoint with actual parent/child
  processes for cancel, timeout, stdin EOF, heartbeat stall and a completed leader
  leaving a child. Check exact PID/PGID/start-time identities and preserve an
  unrelated process group. Use an isolated disposable HOME/workdir.
- [x] T3-3: run `side_chats_isolate_sessions_context_queues_and_reset` against the
  real SQLite-backed API submission path. Preserve main/side parallelism and same-session serialization.
- [x] T3-4: run `routing_validates_targets_and_rolls_back_partial_handoffs` against
  actual persisted queue/session state; inspect separate one-hop cross-chat and
  summary/review guards without claiming a general three-level recursion limit.
  Both tests Passed in actual pipeline61/job255, whose Rust source tree is byte
  identical to this change. The integrated MR still runs the full backend gate.
- [x] T3-5: consolidate candidate-app verification and any available native Windows,
  actual SSH and registered-worker execution. Record unavailable paths honestly;
  Actual local Terminal API Stop/auth/ownership and independent process preservation passed.
  Browser agent Stop, native Windows and registered-worker execution remain explicitly
  unexecuted paths, rather than inferred parity.
- [x] T3-6: reproduce retained adopted-child zombies under application PID 1,
  add `init: true` only to the platform Compose service, and verify reaping through
  the actual API on the same immutable image with Docker init. Render the changed
  production Compose using real Docker Compose; clean only the owned tmpfs fixture.

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

Candidate-only native API regression, with a private owner key file and a valid
local catalog already configured:

```sh
python3 -B src/backend/tests/terminal_process_ownership.py --url http://127.0.0.1:18770 --owner-file /private/candidate-owner.key --workdir /workdir/catalog-acceptance --model agt-fixture-primary --reasoning medium --require-reaped-child
```

This script creates paused audit profiles, runs only explicit local shell commands,
checks HTTP authentication and run ownership, stops its commands and archives its
profiles. It never invokes an agent/provider or an SSH runtime. Use an isolated
Linux candidate, not a shared production organization.
