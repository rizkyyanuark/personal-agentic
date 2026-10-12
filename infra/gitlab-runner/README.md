# Workspace runners

CI-003 uses the existing ARM64 workspace registrations: runner #3 for
verification and runner #4 for rootless image packaging. The owner chose this
host after the GitLab server's measured memory headroom proved insufficient.
The earlier GitLab-host migration and capacity increase are superseded.

Live inspection on 2026-10-13 confirmed both registrations online, unpaused,
project-locked and with `run_untagged = false`:

| Registration | Tag | Template | Access |
| --- | --- | --- | --- |
| #3 verification | `personal-agentic-ci` | `runner.template.toml` | MRs and protected main; no privileged jobs, services or Docker socket |
| #4 rootless image packaging | `personal-agentic-image` | `image-runner.template.toml` | Protected refs only; pinned builder and scoped security profiles |

Both already share `/srv/personal-agentic-ci/config/config.toml` with global
`concurrent = 1`, individual `limit = 1` and `request_concurrency = 1`. Each job
is limited to one CPU and 1 GiB RAM with a 4 GiB combined memory/swap ceiling.
Only `/cache` is mounted; jobs receive no host Docker socket. The manager itself
is capped at 192 MiB RAM and 0.25 CPU. The versioned templates match these bounds;
no runner installation or remote configuration change is required for this
selection.

Project concurrency one prevents overlapping personal-agentic jobs. Yunesa's
separate `gitlab-build-runner` manager can still add load to the same workspace,
so these bounds do not establish a host-wide budget. At inspection, the ARM64
host had two CPUs, 1,835 MiB RAM with 1,069 MiB available, 1,320 MiB swap used and
17 GiB disk free. This idle sample permits a bounded build trial; acceptance
still requires the actual ARM64 pipeline and load evidence.

Preserve the image registration's `buildkit-seccomp.json`, `buildkit.apparmor`
and `infra/ci/buildkit-runc.sh` for the restricted keyring operation. Verification
must not inherit packaging security options. Do not enable privileged mode or
expose a Docker socket to merge-request code. Keep runner tokens private.

Monitor workspace memory/swap, free disk and production HTTP during the actual
backend build. Pause new CI jobs and investigate any OOM, repeated health failures
or sustained swap pressure; pausing a registration does not stop an active job.
Keep production services and other projects' runners unchanged. Protected-main
image publishing and real image smoke remain separate checks from the MR build.
