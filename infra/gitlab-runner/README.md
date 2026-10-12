# GitLab-host runner migration

These templates are proposed source configuration. Installing/registering the
runners and changing host capacity require the owner's approval; they have not
been applied by CI-003.

The audited GitLab host is ARM64, two CPUs and 1,835 MiB RAM. Its cleaned disk has
17 GiB free, but only 272 MiB memory was available and 3,006 MiB swap was in use.
Do not install Rust build jobs on that capacity. The proposed starting capacity
is 8 GiB RAM, with enough disk for the current GitLab data, images and Rust cache;
target at least 20 GiB free before the first uncached build. Validate the actual
build peak and GitLab HTTP responsiveness before accepting the migration.

Use one runner manager with global `concurrent = 1` and two project-only Docker
executor registrations. Set `run_untagged = false` and lock each to this project:

| Registration | Tag | Template | Access |
| --- | --- | --- | --- |
| Verification | `personal-agentic-ci-gitlab` | `runner.template.toml` | MRs and protected main; no privileged jobs, services or Docker socket |
| Rootless image packaging | `personal-agentic-image-gitlab` | `image-runner.template.toml` | Protected refs only; pinned builder and scoped security profiles |

The templates bound each registration to one job. This alone does not serialize
two registrations: both must share the single manager's global concurrency.
Do not run another manager for this project on the same host. Audit other
projects' managers separately before making a host-wide capacity claim.

Install `buildkit-seccomp.json` and the AppArmor profile `buildkit.apparmor` at the
template's expected paths, preserving the versioned restricted rules. The image
job uses `infra/ci/buildkit-runc.sh` to avoid the denied keyring operation. Do not
give the verification registration the packaging security options or enable
privileged mode. Keep registration tokens in private host configuration.

Before migration, preserve current runner configuration and registrations. Bring
up the new tags, pass a real ARM64 MR pipeline, then prove a protected-main image
publish/smoke. Monitor memory/swap, free disk and GitLab HTTP while the backend
compiles. Pause new jobs and investigate any OOM, repeated HTTP failures or
sustained swap pressure; pausing a registration does not stop an active job.
Remove only this project's old workspace registrations after replacement proof;
keep other projects and production services unchanged.

Docker daemon log defaults apply to newly created containers. The existing
`gitlab-ce` container retained an empty logging-options object after the reported
daemon reload. Apply explicit `max-size=50m`, `max-file=3` when that container is
recreated through its existing maintenance procedure, preserving volumes and
configuration. Do not recreate GitLab as an implicit runner-installation step.
