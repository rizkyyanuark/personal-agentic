# Development and production releases

GitLab is the canonical release source; GitHub is a downstream mirror. Develop on
`codex/*`, verify the real app, then use an MR reviewed by the maintainer. Production
state and provider credentials remain independent of the laptop organization.
[CI-003](../openspec/changes/CI-003-simple-automatic-releases/proposal.md) records
this change; [dated preparation history](DEV-PROD-WORKFLOW-HISTORY.md) preserves
older installation and capacity evidence.

## Activation boundary

This source removes deployment drain and configures automatic protected-main
releases using the existing workspace runners. Source and local proof do not
establish installed-helper acceptance or a production release.
Complete the following before merging this change:

1. Preserve the existing project runner registrations #3 and #4 using
   `personal-agentic-ci` and `personal-agentic-image`, sharing one manager with
   `concurrent = 1`. Preserve their separate verification and packaging privileges.
2. Run the latest real ARM64 MR pipeline and inspect workspace memory, swap and
   production health during the backend build. Other projects use separate
   managers, so project concurrency does not establish a host-wide budget.
3. Install the reviewed `infra/production/release.py` as the root-owned production
   helper through the administrative connection, preserving its previous binary,
   ownership, mode and release journals. Verify installed-source hash and `status`.
   The deploy key cannot update this helper or its own access rules.
4. Verify protected `main`, protected production-scoped SSH file variables,
   registry credentials and GitLab's prevention of outdated deployments.
5. Merge only after review and CI acceptance. The main pipeline publishes and
   smoke-tests the image before automatic production promotion.

Live inspection on 2026-10-13 confirmed both project registrations online and
sharing concurrency one. Jobs have one CPU, 1 GiB RAM and a 4 GiB combined
memory/swap ceiling; the manager has a 192 MiB / 0.25 CPU cap. Workspace available
RAM was 1,069 MiB, swap used 1,320 MiB and free disk 17 GiB. Verify build load
rather than treating this idle sample as a capacity guarantee.

The owner chose the workspace after the GitLab-host capacity audit found only
272 MiB available RAM and 3,006 MiB swap used, despite 17 GiB free disk after log
cleanup. The earlier GitLab-host migration proposal is superseded; no host resize
or new runner registration is required. See the [runner setup](../infra/gitlab-runner/README.md)
for the selected executor boundaries. Production still has the earlier helper;
install and verify the current source before accepting automatic promotion.

## Pipeline

| Trigger | Behavior |
| --- | --- |
| Merge request | Frontend, Rust, SSH bridge and production/deploy-client checks |
| Protected main after merge | Verification, registry authentication, immutable ARM64 image, real image smoke, automatic production deploy |
| Unprotected branch | Verification only; no release credentials or production deployment |
| Busy production / stale main at deploy start | Fail visibly; retry the deploy job after work finishes, or use the newest main pipeline |

CI requests the existing workspace tags `personal-agentic-ci` and
`personal-agentic-image`. Both project registrations share one manager with
global concurrency one. This prevents overlapping personal-agentic jobs;
Yunesa and other independent managers may still add load to the same host.

Frontend and Rust compile once in verification jobs. Packaging reuses their
artifacts, including the stripped XZ backend to fit the GitLab upload limit.
The rootless builder retains its scoped security profiles and keyring wrapper;
verification jobs remain unprivileged without Docker socket access. Production
pulls an immutable registry digest and never compiles source.

`resource_group: production` serializes project releases. The deploy client
checks the pipeline's full SHA against main before SSH; main can still advance
after that check, so retain GitLab's outdated-deployment protection. Merge-request
pipelines cannot publish images or deploy production.

## Production promotion

`infra/ci/deploy.py` sends the tested digest, full commit and source SVG hash to
the existing restricted SSH command. `PROD_SSH_PRIVATE_KEY` and
`PROD_SSH_KNOWN_HOSTS` are File, Protected variables scoped to `production`, with
expansion disabled. Use the dedicated deployment identity, never an administrative
PEM. Host keys come from a trusted connection; do not disable host-key checking.

The deploy account has no Docker group, unrestricted shell, forwarding or PTY.
Its forced `release` command invokes only the root-owned helper through the
existing exact sudoers rule. Registry and application secrets stay private on
the production server under `/opt/personal-agentic`.

The helper validates native ARM64, repository digest and actual container commit,
checks active/queued/waiting runs, terminals and indexing before pulling and
immediately before/after stopping services, then backs up stopped production
state. It promotes only the requested image and verifies readiness, login/logout,
authenticated state, cockpit, frontend and the exact Antigravity SVG. CI verifies
the returned release identity and public HTTPS health and saves sanitized JSON
artifacts. Private release journals and backup manifests remain on the server.

The job has a 90-minute ceiling and SSH a 75-minute ceiling to accommodate the
existing bounded backup operations and cleanup. These are upper timeouts, not a
drain wait or an expected outage duration; normal deployment finishes earlier.

There is no admission lock or drain wait. Busy work refuses deployment. A request
arriving between the final check and service stop can be interrupted; the post-stop
check then rejects the upgrade. Deploy during an idle period, particularly with
scheduled work. Successful deployment has a stop/backup/restart gap;
zero downtime is not provided by this single-instance procedure.

A historical `org/.state/deployment-drain.json` is ignored by the new application.
It is not read, rewritten or used to block work; no database migration is required.

## Failure and recovery

The helper holds a host release lock and preserves pending/current/previous
journals. Failed candidate startup or smoke fails the job with retained evidence
and backup. It does not silently restore databases or roll back the image.
A failure before image replacement may restart the unchanged verified source;
review the returned failure and private journal before retrying.

An administrator can verify the installed release with:

```sh
printf '%s\n' '{"action":"status"}' | sudo python3 -I /usr/local/sbin/personal-agentic-release
```

This performs login/logout smoke, creating and revoking a temporary session.
Explicit `recover` requires the same tested digest, full commit and SVG hash and
validates the pending transaction and backup; it does not replace the image.
Rollback requires a verified previous release and
`acknowledge_database_risk: true`. Schema equality does not establish semantic
data compatibility. Never use `docker compose down -v` for rollback. Keep off-host
backup retention separately; same-disk backups cannot recover a lost instance.

## Verification

Run the frontend and Rust checks in [src/VERIFICATION.md](../src/VERIFICATION.md),
plus the Linux release-helper and deploy-client suites and shell syntax checks.
Exercise a disposable current-source app through real authenticated API/browser
flows. Local AMD64 results do not substitute for the ARM64 main image smoke,
installed-helper acceptance or a production release record.
