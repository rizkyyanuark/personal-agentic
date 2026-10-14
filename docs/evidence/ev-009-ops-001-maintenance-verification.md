# Ev-009: OPS-001 scoped maintenance and host activation

14 October 2026, Asia/Jakarta. Contract:
[OPS-001](../../openspec/changes/OPS-001-host-hygiene-and-resource-governance/proposal.md).
Result: implementation, physical Docker acceptance, named-window measurement and
reviewed host activation verified. Publication/merge/application-image deployment
remain separate from this maintenance result.

## Source identity

- Checkout: `C:/Users/rizky/.codex/worktrees/host-resource-governance/personal-agentic`.
- Branch: `codex/host-resource-governance`; base `ec70e3287682fdc3c6a86df03054a38fe6e92817`.
- Original primary checkout's dirty source/docs were preserved; only the OPS contract was imported into this dedicated worktree.
- `infra/ops/maintenance.py` SHA256 `cbff8316f87499e20b3bcab343fcf29dbee57488824bcb6a009c363fc002843d`.
- Final `infra/ops/measure.py` SHA256 `b01e699f9d98feccd22ebd185a6a2bc3835bf4bd792e0ac6676a3b8b91159ee7`.
- Service SHA256 `a3082e75c89e53d4a9905aa0322846c9a309fb797501ef05c04b6ca91631afcd`.
- Timer SHA256 `2199e5415f5af83554c5bb8052f2ab71ca0a5a6981bce16ea172b161ea210c34`.

These exact helper/unit bytes were installed and compared with source. The source
commit/MR records the whole implementation; base SHA alone is not patch identity.

## Inventory and correction

Actual Docker server: 29.7.2, containerd OCI image store. Existing image ownership
was checked by full IDs, exact OCI source/revision and repository references.
Production current `ec70e328` image
`sha256:84cae56460603822e5eee645c634fcc64f7c125ca108b6259f5f800aa2c4cf9e`
and previous `47a74a05` image
`sha256:e2006ac0f9fca87e8549b8f975c2d16738b8e7b52beda12eb99c585dd51d95bb`
were protected. Two other owned platform images remained in the seven-day
creation-age grace; all foreign/unproven images remained excluded. The actual
production plan had zero candidates and retained 15 existing images.

The real runner caches are Docker `/cache` volumes, including Cargo/target,
per-job rootless BuildKit and registry cache. No proven disposable cache store
was enrolled. Draft global `docker builder prune` / `docker image prune` were
replaced with explicit ID deletion. All volumes, chat history, backup/config/keys
and other projects stay outside cleanup. Existing Compose/runner limits were not
changed; an idle runner manager is not itself treated as a job.

## Executed acceptance

Linux commands from the dedicated checkout:

```sh
python3 -B infra/ops/tests/maintenance_test.py
python3 -B infra/ops/tests/measure_test.py
sudo python3 -B infra/ops/tests/docker_smoke.py --allow-isolated-image-fixture
```

The two regression suites ran under WSL Ubuntu-24.04/root: **8 + 7 tests passed**.
They used real private files, permissions, symlinks/flock, real loopback HTTP
responses and Linux counters. Controlled HTTP payloads are external-boundary
fixtures, not a fake production-path completion claim.

The physical smoke ran through bounded SSH as the authorized root operator. It
loaded the exact `/usr/local/sbin/personal-agentic-maintenance` source with a
SourceFileLoader, invoked the same snapshot/apply implementation and used actual
Docker transport. Only repository/source/private release root/zero age policy
differed. Four tiny local scratch OCI images were imported, with no build, pull,
provider call or application run. One unstarted fixture runner container and a
real copied `sleep` executable named `cargo` exercised active-work refusal.

| Check | Actual outcome |
| --- | --- |
| Current/previous/foreign fixture image protection | Retained; only obsolete selected |
| Expired plan | `Plan expired; create a new dry-run` |
| Journal/reference changed after planning | `Release references or candidates changed; create a new dry-run` |
| Pending journal / created CI job / actual Cargo-named process | `CI/build or pending release is active; cleanup deferred` |
| Actual deletion | Only `sha256:707a1a366426e0dba958c900409f9cfe52516b66d72de3f46d6165249afa57b4` removed with `docker image rm --no-prune` |
| Empty-plan apply | `status=applied`, `removed_ids=[]`, free-space delta0 |
| Existing resources | 15 images, 8 containers, 10 volumes unchanged after all fixture cleanup |
| Production health | HTTP200, JSON `status=ok` |

The selected image-size sum was 11,115 bytes; observed filesystem free-space
delta was 36,864 bytes. This is a filesystem observation, not a guaranteed
attributable reclaimed-byte amount. Shared layers and unrelated host I/O remain
possible. All fixture resources were cleaned, and no real release image was
deleted to manufacture proof. No internal mechanism or Docker result was mocked.

An initial OCI fixture used an unqualified containerd name and failed inspection;
its exact uniquely labelled ID was inspected and cleaned. The fixture was
corrected to canonical `localhost/...@digest`. One SSH transport reset was
followed by a read-only check confirming no fixture leftovers and HTTP200 before
retry. The final installed-source smoke above passed after those corrections.

## Named workload window

Final sampler: 2026-10-14 **02:44:51–02:45:48 UTC** (09:44–09:45 WIB),
20 samples, 57.36 seconds. Workload name: production background and isolated
acceptance activity plus read-only health probes; **no CI peak exercised**.

| Metric | Observed |
| --- | --- |
| Production health failures / maximum latency | 0 / 59.39 ms |
| Minimum available RAM | 1,049,708 KiB |
| Maximum used swap | 1,243,056 KiB |
| Swap in / out | 81 / 0 pages |
| CPU busy / I/O wait | 8.41% / 0.08% |
| Minimum disk available | 35,881,238,528 bytes |
| Minimum free inodes | 9,344,325 |
| Kernel OOM delta / container restart deltas | 0 / none |
| Production container IDs | Unchanged |

The sampler also captured actual CPU/memory/I/O PSI and configured container
resource bounds. CPU busy excludes idle and I/O wait. The earlier background
sample was retained privately; the table uses corrected sampler source SHA256
`3cfbad47b873bb23ac6994beee4ed1479c75f2a734c19b901c4e4d0fc4c06724`.
The final sampler adds optional private per-sample JSONL progress and an operator
stop marker so a long CI observation can end when the workload completes. Its
separate actual-host acceptance observed two real HTTP samples (both ready),
two flushed JSONL records in mode0600 and the pre-existing stop marker respected;
production container IDs remained unchanged. This short check establishes the
new controls, not a capacity window. The unchanged counter/health path was also
covered by the final seven sampler regressions.
This establishes the named observation window, not concurrent-project capacity.
Existing runner documentation contains prior CI-58 measurements; those are
historical evidence, not a repeated CI peak in this acceptance. The integrating
task will measure its actual CI window separately.

## Reviewed installation and real service execution

Activation completed **2026-10-14T06:18:06Z** (13:18 WIB), after root review within
the user's request to finish all work. Existing helper/unit files were absent.
The installer nevertheless created root-private installation provenance at
`/opt/personal-agentic/maintenance-install-backups/20261014T061753Z-8fe3585a`;
any existing file would have been backed up before atomic replacement.

- `/usr/local/sbin/personal-agentic-maintenance`: root `0755`, helper hash above.
- Service/timer `/etc/systemd/system/personal-agentic-maintenance.{service,timer}`: root `0644`, hashes above.
- `systemd-analyze verify`: passed for both installed units.
- `systemd-analyze calendar '*-*-* 03:15:00 Asia/Jakarta'`: normalized to the same named-zone schedule.
- `systemctl enable --now personal-agentic-maintenance.timer`: `ActiveState=active`, `UnitFileState=enabled`.
- Next event: 2026-10-14 20:31:18 UTC = 15 October 03:31:18 WIB, including random delay.
- `systemctl start personal-agentic-maintenance.service`: `Result=success`, `ExecMainStatus=0`.
- Applied service bounds: `CPUQuotaPerSecUSec=100ms`, `MemoryMax=134217728`, `IOWeight=10`; timeout180s/Nice19 from installed unit.
- Actual journal: `event=plan`, zero candidates, then `status=applied`, `removed_ids=[]`, filesystem delta0, current/previous protected, containers/volumes/references unchanged.
- All image/container/volume identities unchanged across installation and service execution; real production HTTP200 before and after.

No production application or runner was restarted. A future daily timer firing
has not yet occurred; actual manual execution of that installed service and the
enabled schedule were verified. Disable using the operator README if required.

## PROOF

- User path exercised: root CLI inventory → plan → freshness/conflict checks → exact-image apply; installed daily systemd service → real production health; named workload sampling.
- Commands run: focused WSL suites; actual Docker OCI/load/inspect/create/rm operations limited to fixture IDs; `maintenance plan/automatic`; sampler; systemd verify/calendar/enable/start/show/journal; source hashes; Git diff checks.
- Key outputs: 15 regressions passed; installed-source physical smoke passed; 15 existing images retained; actual service exit0 and zero deletions; metrics above; HTTP200.
- Files changed: `infra/ops` production CLI/sampler/operator units/tests; OPS contract/tasks/verification; this evidence.
- Real dependencies used: Git, Python stdlib/WSL, real Linux private filesystem/flock/proc counters, Docker29 daemon/OCI store, actual process, loopback and production HTTP, installed systemd.
- Mocks used, with justification: none for production mechanisms. Explicit owned OCI/release-root/age and loopback HTTP contract fixtures were used to avoid deleting a real release or provoking a real outage.
- Remaining risks: simultaneous-project/peak-build capacity is unverified here; sampling cannot exclude all future job starts; Docker atomic non-force protection and release/reference guards remain; no cache/volume/chat deletion; filesystem delta is not guaranteed attributable reclamation.
