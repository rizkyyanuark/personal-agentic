# CI-003: simpler CI and automatic production releases

Issue: [GitLab #5](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/5).
Owner: product owner; coordinator: Codex. Scope requested on 2026-10-13: simplify
CI/CD, remove deployment drain and automatically deploy after MR merge. The owner
initially requested builds outside the workspace, then chose the existing ARM64
workspace runners after the GitLab-host feasibility audit found insufficient RAM.
The GitLab-host migration and capacity increase are superseded. Use existing
registrations #3 and #4 with bounded resources and one shared personal-agentic
manager, not new GitLab-host runners. Production helper installation and merge
remain separate release steps.

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
| CI-003-R4 | CI uses existing workspace tags `personal-agentic-ci` (#3) and `personal-agentic-image` (#4), preserving their different privileges. One manager with `concurrent = 1` serializes personal-agentic jobs and retains bounded job resources. Separate projects may still run concurrently; actual ARM64 CI and workspace load evidence are required before release acceptance. |

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

The superseded GitLab-host proposal was rejected on measured capacity: native
ARM64, two CPUs, 1,835 MiB RAM, 272 MiB available, 3,006 MiB swap used and 17 GiB
free disk after the colleague's log cleanup. Disk cleanup did not resolve memory
pressure. The owner then authorized using the existing workspace runners without
resizing GitLab or registering new runners there.

Live workspace inspection confirmed #3/#4 online, unpaused, project-locked,
`run_untagged = false`, and one shared manager with `concurrent = 1`. Each job
retains one CPU, 1 GiB RAM, 4 GiB combined memory/swap and only `/cache`, with no
Docker socket. The manager has a 192 MiB / 0.25 CPU cap. Workspace RAM available
was 1,069 MiB, swap used 1,320 MiB and disk free 17 GiB. These idle values support
a bounded build trial, not a proven peak margin. Yunesa has a separate manager;
personal-agentic concurrency one is a project budget, not a host-wide guarantee.

## Tasks and proof

| Task | Requirement | Result and evidence |
| --- | --- | --- |
| Source removal and preservation audit | R1 | Passed: final Rust fmt, 145 locked workspace tests, stripped binary build; generated StateView matches host. Terminal exact-input replay uses real persisted SQLite; independent API/Matrix/fleet/collector fixes retained |
| Release/helper/client simplification | R2, R3 | Linux helper 37 tests passed; deploy client 10 tests passed; real HTTP, SQLite, archives/journals; shell syntax passed |
| SSH bridge and scoped documents | R1 | Real Linux Python 3.11 + Git: skill discovery 24 tests and document read/export 21 tests passed; runner TOML parsed; current local documentation links valid |
| Frontend wiring | R1 | `npm run check` passed: strict TypeScript, lint, Vite and 203 cockpit tests; cockpit workspace 12/12 passed. Final real Edge flow create/rename/archive/restore/reload/delete group and chat persistence passed, zero browser errors/provider runs; archived writes 400 and knowledge read-only controls preserved |
| Current-source application | R1 | Actual `src/Dockerfile`, final binary and frontend, local AMD64 candidate on loopback 18768 with isolated Linux volumes and 512 MiB RAM cap: health/login/state; anonymous state 401; removed GET/POST 404; no maintenance field/banner; ordinary chat persists, exact replay same ID, conflicting input 400, logout revocation 401. Preseeded sealed marker remains byte-identical |
| Persistence / restart | R1 | Passed: actual stopped test-volume SQLite DB+WAL copied privately into tmpfs for read-only inspection; both API/UI messages have exactly one row, `PRAGMA integrity_check = ok`. Restarted candidate API returns both persisted messages, zero runs, no maintenance field and unchanged legacy marker |
| GitLab pipeline simulation | R2, R4 | Initial source CI lint dry-run: protected main has seven jobs and automatic deploy; unprotected branch has only four verification jobs. Both valid with zero errors/warnings. Revalidation of the workspace-tag revision and actual ARM64 pipeline pending |
| Workspace manager and real ARM64 CI | R4 | Existing #3/#4 registrations and shared concurrency-one manager verified live; no remote change required. Latest ARM64 MR pipeline and workspace load acceptance pending |
| Installed helper / production release | R3 | Not run: separate reviewed administrative installation and release acceptance pending |

Tests substitute only external Git/SSH deployment boundaries and one destructive
Docker busy-preflight boundary. Actual HTTP transport, filesystem, SQLite and
browser proof are used where feasible; no model execution is required to prove
drain removal. Provider continuation/collector behavior and terminal/Matrix replay
fixes independent of drain are preserved.

Generated state, owner keys, test databases, screenshots and build logs stay in
ignored scratch/test volumes; sanitized outcomes belong here. Source proof does
not establish latest ARM64 CI, merge or production activation. See the
[current runbook](../../../docs/DEV-PROD-WORKFLOW.md) for activation and recovery.

Final local backend image: `sha256:08ebaa266abd1619d36ce1b8835794847446938255fba1c082b034d06a01fbce`.
Packaged app: `sha256:9b0c87550993db8cebb0445105c6acce919ff89c890e11c6a2a6d5bbf2eb31a5`.
Stripped binary SHA-256: `305d6bff0d868989bf46fe6fc291655291c0f9482054fb9e1aa5b75a696afe36`.
Served/source SVG SHA-256: `d775965ea1f8060538c15f758a3e22487317211fcb6051333b5e023f35aa726f`.
These are local AMD64 proof identities, not production registry releases. No live
provider turn was invoked. The existing Dockerfile CLI installer selected AGY
1.3.3; provider execution compatibility is outside this removal acceptance.
