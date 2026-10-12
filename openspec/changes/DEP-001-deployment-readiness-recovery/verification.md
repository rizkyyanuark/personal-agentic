# DEP-001 verification

Baseline inspected: `47a74a051f4e9c34a947be11f9565c78e78648d7`, Windows development checkout and existing release helper source.
The prior pipeline47/188 failure and guarded recovery/189 success are evidence of the problem, not proof of this implementation.
Credentials, production DBs, raw provider output and backups stay outside source control.

| Check | Requirement | Result | Evidence / limit |
| --- | --- | --- | --- |
| Source and prior failure audit | R1–R5 | Inspected | Existing startup retry omits connection resets; no recover action; predecessor/current/backup identities inspected |
| Focused HTTP/filesystem/SQLite contracts | R1–R4 | Passed | 34 tests, Linux Python3.11, 1.746s; real TCP/HTTP, POSIX timer, private files/archives, atomic journal failures and SQLite. `scratch/dep-001/tests-final-linux.log` |
| Real app readiness transport | R1/R5 | Passed | Candidate `wait_ready` encountered a real TCP reset, retried and read the existing local application's `status=ok` response; two requests, one forwarded response, 0.099s. `scratch/dep-001/readiness-real-app-proof.json` |
| Candidate CLI unchanged recovery | R2/R3/R5 | Passed within stated limit | Candidate source executed through its actual `main` on production under the root release lock; exact released digest/commit, no pending record, `unchanged=true`. Normal owner-login/authenticated-state/cockpit/logout-revocation/UI/SVG smoke passed. `scratch/dep-001/candidate-cli-proof.json` |
| Production preservation | R5 | Passed | Before/after database state/schema, current/previous/pending records, installed helper/Compose hashes and container identities matched. Normal smoke creates then revokes its authentication session. `scratch/dep-001/preflight-before-cli.json`, `preflight-after-cli.json` |
| Independent review | R1–R5 | Passed | Review findings resolved: slow-response deadline, first-promotion predecessor, and stable verified evidence during partial journal replay. Final source reviewed; final tests rerun |
| Source provenance | R5 | Passed | Working helper bytes equal the committed Git blob, both SHA256 `3fdb452259f2b86fb194c35a5992c5dc3125d4e9677f35cbd4d0359ea97ffdf5`; LF enforced by repository attributes. `scratch/dep-001/source-provenance.json` |
| GitLab CI configuration | R5 | Passed | GitLab project5 lint and pipeline simulation on protected main: valid, no errors/warnings, `deploy_production` remains `manual`; no pipeline created. `scratch/dep-001/ci-lint-proof.json` |
| CI capacity setup | R5 prerequisite | Passed | Owner approved snapshot and expansion; `snap-00e15ee378cd9f0ab` completed100%, EBS60→80GiB, online `growpart`/`resize2fs` succeeded, boot partitions unchanged, free disk24.95GB. Database/release/container/helper facts preserved; full installed-helper smoke and public health passed. `scratch/dep-001/filesystem-grown-proof.json`, `ebs-preservation-proof.json`, `after-ebs-product-smoke.json` |
| Latest GitLab CI | R1–R5 | Pending publication | Full MR jobs will run after push/Draft MR; the MR pipeline is authoritative for the latest SHA. Capacity gate passed; this local result does not claim remote CI success |
| Installed production helper | R5 | Not run | Reviewed administrator installation pending |
| Routine automatic deployment | Subsequent change | Not run | Phased policy accepted; atomic drain and policy implementation not yet delivered |

Candidate source SHA256: `3fdb452259f2b86fb194c35a5992c5dc3125d4e9677f35cbd4d0359ea97ffdf5`.
The installed helper stayed at SHA256 `a7df62fd52e6ec2f9b49b293c7617fd8ddc4241615b2386786fadcfb9481797a`.
The unchanged CLI proof does not exercise pending-record finalization against production: that branch uses physical filesystem/SQLite contracts, avoiding fabrication of a failed production journal.

No internal modules or application services were mocked. Focused transport tests use deterministic HTTP fault fixtures at the external network boundary; the real-app proof forwards the successful request to the existing application. These fixtures do not establish provider execution or a production image promotion.
Scratch evidence is ignored local output, not committed secrets or production database copies.

Capacity audit (2026-10-12): the cold MR compiler cache estimate5.57GB exceeded the original4.15GB free. The owner then separately authorized snapshot and root EBS `vol-0de05867d2eaa324a` growth60→80GiB, preserving gp3/3000IOPS/125MiB/s. Docker and `/opt/personal-agentic` share ext4 `/dev/nvme0n1p1`; post-growth free24.95GB exceeds the conservative9GB target. No active CI containers were found before publication. The protected main compiler cache, rollback images and stopped-state application backup remain retained. The EBS snapshot is a live crash-consistent disk copy; no restore/boot test is claimed. A new CI peak has not yet been measured.
