# DEP-002 verification

Baseline `18f4dfb4b3b07451cbca5520de6c389fe9a2ed34`, branch `codex/deployment-drain`.
Evidence recorded on 12 October 2026. Source, candidate acceptance, CI and installed
production are separate results. Production still uses application release `47a74a0`;
this change has not been installed and routine deployment remains manual.

| Check | Requirement | Result | Evidence / limit |
| --- | --- | --- | --- |
| Admission/helper/UI source audit | R1–R5 | Inspected | Independent review found readonly reads counted after seal, Matrix rejection notice and runtime image identity gaps; all corrected before final candidate acceptance |
| Backend store/router/ownership/race | R1–R3 | Passed | Final155 Rust tests, zero failed/ignored; real SQLite, authenticated router, global race/ownership, queue/continuation/schedule, Matrix authorization/replay and terminal process |
| Resumed summary collector correction | R2/R5 | Passed tests, binary build, independent review and native acceptance | Actual sanitized SUCCESS frame regression plus missing/null/blank-response failure regression; Summary chooses current response, Coordinator retains structured routing. Full final155-test suite and real binary build passed; correct current response published through real chat |
| Helper physical transport/journal | R4 | Passed | Final58 tests; real TCP/HTTP, private files, SQLite, archives and release journals, including application reopen before helper timer. Destructive Docker/process effects use boundary fixtures; no production promotion/rollback was executed |
| Real app + terminal + restart | R1–R4 | Passed | Loopback candidate: invalid/anonymous bearer401; two-workspace new-work503; busy seal/wrong owner409; real SSH terminal exit0/output; one-second test expiry; sealed state retained across upgrade to final collector image; exact-owner resume passed |
| Actual helper client + controller | R4 | Passed | Final helper functions over physical loopback Host adapter to final candidate; accepted SSH terminal finished before seal (6.382s), foreign resume refused, one-second test timeout preserved running terminal through exit0, final admission open |
| Native provider attempt 1 | R2/R5 | Failed user-result acceptance | Three actual Antigravity SSH turns, max one active; coordinator accepted before begin, delegate/summary during drain; all native receipts exit0, parent lineage and resumed session correct, remote fixture unchanged. Published summary selected stale routing JSON despite correct current native response |
| Native provider after correction | R2/R5 | Passed | Three additional authorized Antigravity SSH turns, max one active; new root503, delegate/summary admitted while draining, all native receipts exit0, actual file evidence in published summary, resumed coordinator session/lineage, fixture hashes unchanged, seal after cleanup and exact-owner resume/open. Owned group archived and agents soft-deleted; zero cleanup failures |
| UI/browser/auth | R5 | Passed before collector correction | Real SSE, preserved editable draft/focus, disabled new work, actual SSH terminal Stop/history, action/index controls, readable preview/download, seal/reopen and expiry. 320px no overflow; zero browser errors; contrast12.14 light/12.54 dark |
| Frontend package checks | R5 | Passed | Build/typecheck, source lint, 12 frontend contracts and full203 cockpit tests; default lint excludes generated/dependency directories without weakening source rules. Existing chunk-size warning remains |
| CI syntax/protocol assertions | R4/R5 | Passed syntax; packaged runtime pending | Bash syntax and16 embedded Perl assertion blocks compile; GitLab main dry-run valid, zero errors/warnings, production manual/non-optional, timeout90m |
| Latest GitLab MR CI | R5 | Not run | Commit/push/Draft MR pending final local acceptance |
| Production installation | R5 | Not run | Separate owner review and manual bootstrap required; current production has no drain protocol |
| Routine automatic deployment | Subsequent change | Not run | Remains manual |

## Candidate and evidence boundaries

Final AMD64 candidate image:
`sha256:e840388a33e25c46ee1572ed8e8d87c4f111cf9181cd2e0d56cc7b3e65f7135d`,
protocol marker1. It was assembled from the final155-test Rust binary and verified
frontend. The disposable candidate `personal-agentic-dep002-proof` listens only on
`127.0.0.1:18768`. Its data and workdir use separately labeled Linux named volumes;
neither the original laptop service on18766 nor production volumes are used. The
host `scratch/dep-002/org` is a private owner-key replica and browser evidence
directory, not the candidate SQLite organization. The container's SSH key and
known-hosts mounts are read-only and were explicitly approved for the isolated
native proof, with separate authorization for the three-turn corrected attempt.
Only an owned remote `/tmp/personal-agentic-dep002-*`
fixture is inspected. No credential or native identifier belongs in source.

The browser/API/helper proof uses an actual available Antigravity catalog over
SSH for workspace validation and actual SSH terminal commands; it invokes no model
turn. The separate native proof uses the real signed-in remote CLI and advertised
model. Captured-frame regressions support the collector correction but do not
substitute for final native chat publication acceptance.

Ignored evidence: `scratch/dep-002/backend-collector-build.log`,
`helper-reopening-tests.log`, `api-before-collector-upgrade.log`, `api-after-collector-upgrade.log`,
`helper-current-application.log`, `ui-smoke.log`, `proof/api-proof.json`,
`provider-collector-run.log`, `proof/provider-proof.json` and initial
`proof/provider-attempt1/provider-diagnostic.json`.
Browser proof/screenshots are under
`scratch/dep-002/org/.state/verification/deployment-drain-ui`.
Raw native frames and private fixture metadata remain ignored and private. The
initial failed native proof is preserved in `proof/provider-attempt1`.

The final helper-app replay initially exposed the shortened test lease expiring
before its monotonic timer. Both paths safely aborted, but expiry used a combined
ownership error. The helper now explicitly reports admission reopening before
seal as an abort without stopping work. A physical HTTP regression and unchanged
real-controller timeout acceptance both passed; the failed initial replay remains
in `helper-collector-application.log`. Final helper source SHA256:
`4c5ea94d7b1fa3be3f4ece9219419ae2030082cdf8b7044cb8198d1c2f06dd6d`.

No full destructive release CLI was exercised against Docker production. Matrix
delivery was checked against the real handler/store schema, not a live external
homeserver. Packaged ARM64 image smoke belongs to the post-merge main pipeline.
Neither local tests nor a green MR establish production installation, rollback
compatibility or routine automatic deployment.
