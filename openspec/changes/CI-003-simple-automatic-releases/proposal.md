# CI-003: simpler CI and automatic production releases

Issue: [GitLab #5](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/5).
Owner: product owner; coordinator: Codex. Scope requested on 2026-10-13: simplify
CI/CD, remove deployment drain, automatically deploy after MR merge and keep
builds off the workspace server. The owner selected the existing ARM64 GitLab
host and explicitly requested a feasibility check and confirmation before runner
installation. Host resizing, registration/migration, production helper installation
and merge have not been performed.

Checkout: `C:/Users/rizky/.codex/worktrees/cea5/personal-agentic`.
Branch: `codex/ci-simplify-auto-deploy`; clean base:
`4388face4292fa11cdd36fb8ddc624a3bf13928f` (merged DEP-002).
The source supersedes DEP-002's drain behavior; its historical proof is retained.

## Scope and requirements

| ID | Required behavior and acceptance scenario |
| --- | --- |
| CI-003-R1 | Remove drain module, protocol, runtime admission gates, maintenance field and UI controls. With a historical sealed marker in a disposable organization, authenticated state has no maintenance field, removed GET/POST return 404 and normal chat/group mutations persist. Existing auth, archived read-only and idempotent replay behavior remain. |
| CI-003-R2 | MRs run frontend, Rust, SSH bridge and release checks. Protected main verifies registry access, reuses compiled artifacts for a native ARM64 image, smoke-tests its real app paths, then deploys automatically. Unprotected branches cannot publish/deploy. |
| CI-003-R3 | Production promotion retains fixed digest/full SHA/asset identity, host lock, active-work refusal, stopped-state backup, auth/UI smoke and explicit recover/rollback. Busy work fails clearly before shutdown; invalid helper proof or stale main at deploy start fails the CI job. |
| CI-003-R4 | CI requests only the new GitLab-host tags. Without approved registrations jobs wait; they cannot fall back to workspace runners. One manager serializes both project registrations; actual ARM64 build/load proof is required before accepting migration. |

Minimum files: CI YAML and extracted build/publish/deploy scripts; production
helper and its relevant tests; backend drain consumers and generated state binding;
five frontend drain consumers; verification/release docs and runner templates.
No business-feature redesign, provider-auth change, database migration, second
release system or automatic database rollback is introduced.

## Decisions and limits

Keep stripped XZ backend artifacts: the earlier pipeline's upload limit required
them. Keep the pinned rootless builder's scoped profiles and keyring workaround:
they enable the proven executor without exposing a Docker socket to MR code.
Fold registry authentication into the protected-main frontend job, and move
substantial build/deploy shell/Python out of YAML into versioned scripts.

Drain removal is deliberate. There is no atomic admission closure: work entering
between the final busy check and stop may be interrupted, then detected by the
post-stop refusal. Busy deployment needs retry after work finishes. The main SHA
check is at job start; main can advance during SSH, so GitLab outdated-deployment
protection remains required. Single-instance stop/backup/restart has an availability
gap. A historical drain marker is ignored, not rewritten or deleted.

Live GitLab capacity after colleague disk cleanup: native ARM64, two CPUs,
1,835 MiB RAM, 272 MiB available, 3,006 MiB swap used, 17 GiB disk free. Memory is
insufficient for installing a Rust runner. Proposed capacity is 8 GiB RAM and at
least 20 GiB free before an uncached build, then measure actual CI pressure. Disk
cleanup is owned by the colleague. Existing GitLab container log options are
still `{}`; new daemon defaults do not change an existing container.

## Tasks and proof

| Task | Requirement | Result and evidence |
| --- | --- | --- |
| Source removal and preservation audit | R1 | Passed: final Rust fmt, 145 locked workspace tests, stripped binary build; generated StateView matches host. Terminal exact-input replay uses real persisted SQLite; independent API/Matrix/fleet/collector fixes retained |
| Release/helper/client simplification | R2, R3 | Linux helper 37 tests passed; deploy client 10 tests passed; real HTTP, SQLite, archives/journals; shell syntax passed |
| SSH bridge and scoped documents | R1 | Real Linux Python 3.11 + Git: skill discovery 24 tests and document read/export 21 tests passed; runner TOML parsed; current local documentation links valid |
| Frontend wiring | R1 | `npm run check` passed: strict TypeScript, lint, Vite and 203 cockpit tests; cockpit workspace 12/12 passed. Final real Edge flow create/rename/archive/restore/reload/delete group and chat persistence passed, zero browser errors/provider runs; archived writes 400 and knowledge read-only controls preserved |
| Current-source application | R1 | Actual `src/Dockerfile`, final binary and frontend, local AMD64 candidate on loopback 18768 with isolated Linux volumes and 512 MiB RAM cap: health/login/state; anonymous state 401; removed GET/POST 404; no maintenance field/banner; ordinary chat persists, exact replay same ID, conflicting input 400, logout revocation 401. Preseeded sealed marker remains byte-identical |
| Persistence / restart | R1 | Passed: actual stopped test-volume SQLite DB+WAL copied privately into tmpfs for read-only inspection; both API/UI messages have exactly one row, `PRAGMA integrity_check = ok`. Restarted candidate API returns both persisted messages, zero runs, no maintenance field and unchanged legacy marker |
| GitLab pipeline simulation | R2, R4 | Project 5 CI lint dry-run: protected main has seven jobs and automatic deploy; unprotected branch has only four verification jobs. Both valid with zero errors/warnings; no pipeline executed |
| Runner installation and real ARM64 CI | R4 | Not run: owner confirmation and host memory capacity pending |
| Installed helper / production release | R3 | Not run: separate reviewed administrative installation and release acceptance pending |

Tests substitute only external Git/SSH deployment boundaries and one destructive
Docker busy-preflight boundary. Actual HTTP transport, filesystem, SQLite and
browser proof are used where feasible; no model execution is required to prove
drain removal. Provider continuation/collector behavior and terminal/Matrix replay
fixes independent of drain are preserved.

Generated state, owner keys, test databases, screenshots and build logs stay in
ignored scratch/test volumes; sanitized outcomes belong here. Source proof does
not establish runner registration, merge or production activation. See the
[current runbook](../../../docs/DEV-PROD-WORKFLOW.md) for activation and recovery.

Final local backend image: `sha256:08ebaa266abd1619d36ce1b8835794847446938255fba1c082b034d06a01fbce`.
Packaged app: `sha256:9b0c87550993db8cebb0445105c6acce919ff89c890e11c6a2a6d5bbf2eb31a5`.
Stripped binary SHA-256: `305d6bff0d868989bf46fe6fc291655291c0f9482054fb9e1aa5b75a696afe36`.
Served/source SVG SHA-256: `d775965ea1f8060538c15f758a3e22487317211fcb6051333b5e023f35aa726f`.
These are local AMD64 proof identities, not production registry releases. No live
provider turn was invoked. The existing Dockerfile CLI installer selected AGY
1.3.3; provider execution compatibility is outside this removal acceptance.
