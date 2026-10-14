# Verification: OPS-001

[Proposal](proposal.md) · [Tasks](tasks.md) · [Ev-009](../../../../docs/evidence/ev-009-ops-001-maintenance-verification.md)

Source/base: dedicated `codex/host-resource-governance` checkout, base
`ec70e3287682fdc3c6a86df03054a38fe6e92817`, exact helper/sampler hashes in ev-009.
Acceptance below was executed on 14 October 2026. Publication/merge and the
application image release are separate results; this host maintenance helper
does not restart or redeploy the application.

| Requirement | Evidence | Outcome |
| --- | --- | --- |
| REQ-1 owner/protected plan | Actual Docker inventory; current/previous digests protected; 15 existing images retained; private journal/foreign/shared/stopped-container/age regressions | Passed |
| REQ-2 freshness/conflict | Real flock; expired/changed/pending journals, created runner job and actual process named Cargo refused in Docker smoke | Passed |
| REQ-3 exact safe removal | Installed helper's real implementation removed only obsolete OCI fixture ID; all existing image/container/volume identities and health retained; empty plan applied | Passed |
| REQ-4 workload measurement | 20 samples over 57.36 s, real background+acceptance workload and production HTTP; RAM/swap/I/O/inodes/OOM/restarts recorded; seven real loopback HTTP/Linux/private-progress regressions and actual stop-marker/progress acceptance | Passed for named window |
| REQ-5 host automation | Root0755 installed helper SHA matches source; verified service/timer enabled+active; actual manual service exit0; zero candidates/deletions; 10% CPU/128 MiB/IOweight10 limits | Passed |
| Actual peak/concurrent-project capacity | This window did not run a new CI peak; root will measure the integrated main/MR CI separately | Not run in this acceptance |
| Cache deletion/volume deletion/chat retention | No owner-scoped disposable cache passed enrollment; all such deletion excluded by contract | Out of scope |

Commands: Linux `maintenance_test.py` (8 passed), `measure_test.py` (7 passed),
opt-in Docker smoke via SSH loading the exact installed helper, real production
`plan`/`automatic`, `systemd-analyze verify/calendar`, `systemctl enable/start/show`
and `journalctl`. Complete commands, hashes, measurements, identities and limits
are in ev-009. Real Docker, OCI archives, private files, lock, process, Linux
counters and HTTP were used; no internal production mechanism was mocked.

The physical smoke uses an isolated repository/source/private release-root and
zero creation-age policy; production retains the seven-day age guard. These are
explicit fixture boundaries, not proof of a real release-image deletion. The
actual installed production service applied an empty plan without deletion.

Observed installed state: `personal-agentic-maintenance.timer` enabled/active,
next event 15 October 03:31:18 WIB including random delay; service
`Result=success`, `ExecMainStatus=0`. Daily recurrence is configured; a future
scheduled execution cannot be claimed as already observed.

Limitations: idle runner managers may start a new job after sampling; release
flock/ref rechecks plus Docker's non-force atomic in-use guard protect deletion,
but this is not host-wide CI scheduling. Foreign/shared images and uncertain
caches stay untouched. Shared-layer sizes and unrelated filesystem I/O prevent a
guaranteed reclaimed-byte claim. A local background window cannot establish
capacity for simultaneous projects.
