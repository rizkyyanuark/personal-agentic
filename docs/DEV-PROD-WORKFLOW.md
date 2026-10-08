# Dev and production workflow

## Production preparation — 2026-10-09

The server installation is `/opt/personal-agentic` on workspace EC2
`34.196.37.78`. Local development data is unchanged. The new production
controller and Matrix run as Compose project `personal-agentic-prod`, with
loopback ports 18766/18767 and separate named volumes. Each service is limited
to 0.5 CPU, 512 MiB RAM and 1 GiB combined RAM/swap.

The user completed registry login with the project's `read_registry` deploy
token in `/opt/personal-agentic/registry-auth`. This root-private directory is
explicitly passed to Docker; it is independent of the Ubuntu user's Docker
login. No registry password or owner key belongs in this repository or CI logs.

The bootstrap uses pipeline #23's verified image for commit
`f70653efa26463271915aa9a2ef5e651ce3e176b`:

```text
registry.tugasakhir.space/rizkyyanuark/personal-agentic/platform@sha256:08a16291455d01fafb2aaecabb3085bd54da264068ef5d39c4cac812f6b5074a
```

Matrix registration/login and controller health returned success. Production
Galileo uses the default organization, workstation `production-agy`, dedicated
key `/run/ae-ssh/id_ed25519`, native `/home/ubuntu/.local/bin/agy` 1.3.1,
and `/home/ubuntu/workspace/production/research`. A real direct run with
`gemini-3.8-flash-high` succeeded and returned `AGY_PRODUCTION_OK`; its ID is
`9e4d0ac8-2185-4274-975b-5ac9a6a41032`. The runtime shares Ubuntu's existing
AGY provider identity; the workdir and controller state are separate.

Cloudflare has a DNS-only A record for `agent.tugasakhir.space` pointing to
the workspace EC2, TTL 300. Let's Encrypt issued the origin certificate,
initially expiring 2027-01-06. This avoids changing TLS settings for other
hostnames. `certbot.timer` handles renewal; its deploy hook validates and reloads
Nginx. No certificate contact email has been configured.

**The public site is in maintenance (HTTPS 503).** The final proxy configuration
is staged at `/opt/personal-agentic/nginx.conf`. The integration MR is still
draft; this bootstrap is preparation, not a reviewed `main` release. The final
activation must follow review and a successful protected-main image pipeline.

The final Nginx configuration was exercised on a temporary loopback listener
using the real certificate and production app: health/UI/login/state/cockpit
returned 200, anonymous state/cockpit returned 401, and logout revoked the
session (401). SSE delivered 39 event frames and keepalives ten seconds apart.
The temporary listener was removed. A real `certbot renew --dry-run` also passed.

The first restart exposed a dependency race: the controller attempted Matrix
before its API was listening. Compose now waits for Matrix's healthcheck.
A subsequent stopped-state backup/restart passed the full authentication,
cockpit and asset checks. The verified baseline is recorded under
`/opt/personal-agentic/releases/current.json`; its backup is
`/opt/personal-agentic/backups/20261008T190119Z-17742661`.
The first failed attempt was retained for diagnosis without changing the image.
All four archive hashes were verified. Restoring database files into an isolated
temporary directory produced `PRAGMA integrity_check = ok` for application,
platform identity and Matrix databases; the restored app contained one agent
and the successful AGY run. Live databases were not replaced.

## Operating the production installation

Versioned deployment files live in [`infra/production`](../infra/production).
`bootstrap.sh` validates the private configuration, pulls the selected digest,
initializes Matrix once, verifies its bridge credentials and starts the app.
It preserves existing Matrix data and rejects password/identity mismatches.

`deploy_production` is a blocking manual GitLab job, available only on protected
`main`, after `image_publish` and `image_smoke`. It promotes that pipeline's
digest, full commit and source SVG hash through a restricted SSH command.
`resource_group: production` serializes releases, and GitLab's prevention of
outdated deployments is enabled. MR jobs cannot obtain the production variables.
The one-time MR image trial is complete. Image publishing and image smoke now
run only on protected `main`; ordinary MRs run the verification jobs.

The two GitLab variables are **File**, **Protected**, environment scope
**production**, with expansion disabled:

| Variable | Purpose |
| --- | --- |
| `PROD_SSH_PRIVATE_KEY` | Dedicated `personal-agentic-deploy` identity; never the administrative PEM |
| `PROD_SSH_KNOWN_HOSTS` | EC2 host key obtained through the trusted administrative connection |

Multiline SSH keys use GitLab's visible variable storage setting because they
cannot meet masked-variable whitespace constraints; the job never prints them.
The deploy account has no Docker group membership, no general shell command,
no forwarding and no PTY. Its forced command accepts only `release` and invokes
`/usr/bin/python3 -I /usr/local/sbin/personal-agentic-release` through one exact
sudoers rule. Application secrets and the registry credential stay on EC2.

The helper accepts bounded JSON with `status`, `promote`, or `rollback` actions.
It checks all persisted runs, terminals and indexing work, validates ARM64 and
the image's commit label, and snapshots stopped production state before image
replacement. It verifies login/session revocation, authenticated state, cockpit,
UI and the AGY asset, and records release evidence under
`/opt/personal-agentic/releases`. No image uses a mutable `latest` tag.

Each backup contains the three Compose volumes, the actual remote runtime tree
`/home/ubuntu/workspace/production`, private production configuration and the
selected runtime SSH key. Archive hashes and database schema fingerprints are
recorded in its manifest. Global AGY/provider authentication is excluded and
must be re-established separately after a host recovery.

Run read-only release verification from the server as an administrator:

```sh
printf '%s\n' '{"action":"status"}' | sudo python3 -I /usr/local/sbin/personal-agentic-release
```

An image rollback requires a recorded verified previous release and explicit
`acknowledge_database_risk: true`. Schema changes are rejected automatically;
equal schema alone cannot prove data-semantic compatibility. There is no
automatic database restore. Review the saved manifest and application migrations
before rollback. Never run `docker compose down -v`.

The app currently has no atomic maintenance/drain endpoint. The helper checks
again after stopping services and refuses an upgrade if work appeared during
shutdown, but that work may have been interrupted. Release in a quiet window
with schedules paused and no new user runs. Backups are on the same EC2 disk;
off-host retention is still needed for recovery from instance/disk loss.

Infrastructure files are installed by an administrator after review. The image
promotion job cannot replace its own root helper, sudoers, Compose or Nginx
configuration. Changes to those files require a separate reviewed installation.

After the reviewed release is ready, activate the staged proxy and check it:

```sh
sudo install -m 644 /opt/personal-agentic/nginx.conf /etc/nginx/sites-available/personal-agentic.conf
sudo nginx -t
sudo systemctl reload nginx
curl --fail https://agent.tugasakhir.space/api/health
```

Retrieve the **new** production owner key privately in your own SSH terminal:

```sh
sudo docker exec personal-agentic-prod-platform-1 cat /data/org/.state/owner.key
```

Enter it only on the production login page. Do not paste it into chat, a commit,
or a pipeline variable. Save the registry token and owner key in private storage.

Sources: [GitLab SSH file variables](https://docs.gitlab.com/ci/jobs/ssh_keys/),
[deployment safety](https://docs.gitlab.com/ci/environments/deployment_safety/),
[Certbot webroot and renewal](https://eff-certbot.readthedocs.io/en/stable/using.html#webroot).

## Target layout

Local personal-agentic remains the development environment. Production starts
with new application and Matrix data at `https://agent.tugasakhir.space`.
Do not copy the local database, owner key, sessions, scheduled tasks, or `.env`.

| Component | Development | Production |
| --- | --- | --- |
| UI/controller | Laptop, `http://localhost:18766` | EC2 `34.196.37.78`, behind HTTPS proxy |
| Compose project | Existing `agentic-enterprise` | `personal-agentic-prod` |
| Controller data | Existing local volume | Separate production volume |
| Matrix data | Existing local volume | Separate production volume |
| Workdirs | Existing development workdirs | Dedicated production workdirs |
| Owner credentials | Existing local owner | Newly generated production owner |
| Release source | Feature branches and local edits | Reviewed commit from protected `main` |

GitLab at `gitlab.tugasakhir.space` manages repositories, pipelines and image
storage. Its origin is `3.222.143.253`. Both EC2 instances are ARM64
`t4g.small` instances. Production images must support `linux/arm64`.

## Pre-initialization baseline — 2026-10-08

- GitLab runs `gitlab/gitlab-ce:19.2.7-ce.0`. Its local sign-in endpoint returned
  HTTP 200; the registry at `127.0.0.1:5050/v2/` returned HTTP 401, an
  authentication challenge. External registry routing and login remain to be
  verified before image publishing is enabled.
- GitLab had 1,835 MiB total RAM, 235 MiB available and 2,679 MiB swap in use.
- Application EC2 had approximately 1.8 GiB RAM and 24 GiB free disk. It already
  runs AGY, JupyterLab, MLflow and a Docker build runner.
- `Workspace ARM64 Build Runner` uses Docker, `concurrent = 1`, and mounts the
  host Docker socket into jobs. Such jobs can control containers on this host.
  `privileged = false` does not remove the access granted by this socket.
- `agent.tugasakhir.space` did not resolve from the laptop. The inspected EC2
  Nginx configuration had no server block for it.
- At the start of the audit, Git pointed to GitHub, not a GitLab project.
- Before reconciliation, this checkout and the checkout serving local dev had the same base
  commit, `42fe706be2b7d05f3e90010bdeed5bd000730bed`, but different uncommitted
  changes. The dev checkout included AGY and cockpit changes absent here.

## Release flow

1. Preserve both dirty checkouts. Review and consolidate the desired changes
   from the checkout serving dev into a release branch. Include required new
   files and dependency lockfiles; exclude local state, credentials and output.
   Verify AGY discovery and the current UI through the real application.
2. Create a private personal-agentic project on this GitLab. Use GitLab as the
   release source of truth; keep the private GitHub copy as a downstream mirror. Protect
   `main`, require merge requests, and restrict who can push release tags.
3. Develop on `codex/*` branches. Merge-request pipelines run Rust format and
   workspace tests, frontend lint and build, and relevant integration checks.
   These pipelines receive no production SSH key or production credentials.
4. After a reviewed merge to `main`, build the platform image for ARM64 and push
   it to the GitLab project registry with its full commit SHA. Resolve and record
   the image digest. Smoke-test that image with isolated, disposable data before
   making it eligible for deployment. Keep the current Dockerfile's `platform`
   target; do not deploy the optional worker unless it is actually needed.
5. A blocking manual `deploy_production` job promotes that tested digest. Set
   `environment: production`, URL `https://agent.tugasakhir.space`, and
   `resource_group: production`. Enable GitLab's prevention of outdated
   deployment jobs. Production does not build source or deploy `latest`.
6. Deploy over SSH using a dedicated deployment identity. Pull the selected
   digest, check that no agent runs are active, back up production state, then
   update only the production Compose project. Preserve the volumes.
7. Verify both the loopback API and public HTTPS endpoint, owner login,
   authenticated application state, streaming updates and an actual AGY run in
   a production workdir. Record commit, digest and verification result in the
   GitLab deployment. Container startup alone is insufficient.

The existing runner must not execute merge-request code with the production
Docker socket mounted into jobs. Initial verification can use a separate,
bounded project runner on the current application EC2. This provides container
isolation, while CPU, memory, disk and the kernel remain shared. Measure the
build and runtime responsiveness before approving sustained builds or release
image publishing on this host. No server resizing is required for this trial.

## One-time production bootstrap

Use a production-only Compose definition and server directory, such as
`/opt/personal-agentic`, with a root-readable secrets file. Bind controller and
Matrix ports to loopback. Set `AE_PUBLIC_URL=https://agent.tugasakhir.space` and
retain the container service addresses for `AE_INTERNAL_URL` and Matrix.

Initialize Synapse's configuration, start it, wait for its client API, and
register the bridge account before starting the controller. The existing
`src/install-docker.sh` contains this initialization sequence, but it also
clones from GitHub and builds on the target; it should not be used unchanged as
the production release job. Generate a new bridge password and owner key.

Configure DNS and the existing Nginx ingress for the production domain, with
the original Host forwarded, streaming buffering disabled and suitable read
timeouts. Verify how TLS reaches the origin before opening the domain. Do not
publish the controller or Matrix ports directly to the internet.

The production controller container needs its own SSH configuration/key mount
to reach AGY. A successful SSH command from the laptop does not prove this
container connection works. Use separate production workdirs and verify the
runtime from the production UI. Sharing the existing Ubuntu AGY identity also
shares its global authentication/configuration; separate workdirs alone do not
isolate that identity. Use a separate runtime user when identity isolation is
required.

The NotebookLM relay currently depends on the laptop. Do not treat that relay
as an independent production dependency or copy its credentials into CI.

## Secrets and recovery

- Use protected GitLab file variables for deployment SSH credentials and
  verified `known_hosts`. Do not upload the existing administrative PEM key as
  the general pipeline deployment key.
- Use short-lived CI registry credentials for publishing; use a read-only
  registry credential on the production server. Keep application secrets on
  the server, outside Git and pipeline logs.
- Save the previous deployed digest. Back up SQLite consistently, including
  WAL/SHM when taking a stopped-state backup, and retain required Matrix data.
  Never use `docker compose down -v` as a release or rollback command.
- Roll back to a recorded image digest. If a release migrated the database,
  assess compatibility first; restoring an old image alone does not undo a
  schema migration. Validate the restored application endpoint and state.

## Activation order

Source reconciliation → private GitLab project → bounded project runner →
real MR verification → registry authentication/routing and ARM64 image proof → fresh
production bootstrap → DNS/TLS → manual production deployment → real app proof.

## Repository initialization history — 2026-10-08

The reconciled development source is prepared on `codex/dev-prod-integration`.
The private GitHub destination is
`https://github.com/rizkyyanuark/personal-agentic`; the GitLab destination is
`https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic`.
The original `tirta-ir/personal-agentic-enterprise` remains the upstream source.

GitLab is the canonical destination for development pushes and merge requests.
GitHub is an active downstream push mirror, with divergent refs preserved.
Automatic synchronization was verified after pushing only to GitLab: both
repositories reported commit `d8f0a84fc86e6d17f594d303296b1b89a727fa3b`.
Do not edit the GitHub mirror independently.

GitLab's protected `main` blocks direct pushes and force pushes. Only
Maintainers can merge, and merging requires a successful pipeline. GitLab
validated the initial CI configuration with no errors or warnings.

[Draft merge request !1](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/merge_requests/1)
proposes the reconciled development branch for `main`. It remains open for CI
and review; no merge or production deployment has been performed.

The initial `.gitlab-ci.yml` checks frontend/cockpit, Rust, and the SSH bridge.
Runner #3 is registered and active with tag `personal-agentic-ci`. Job containers
receive neither the host Docker socket nor production credentials. No production
deploy job is included at this stage.

Production service, DNS, deployment identity and image promotion remain later
activation steps. Repository initialization does not deploy the application.

### Bounded CI trial on the existing EC2

The 2026-10-08 inventory found two running ARM64 EC2 instances, both
`t4g.small`, serving GitLab and the application/runtime workspace. A third
instance named `yunesa-prod-server` is stopped and belongs to another workload;
it is not assigned to this runner. The laptop has a Docker Desktop daemon
allocated about 7.6 GiB and eight CPUs, but Windows reported only about 415 MiB
free physical memory during the check.

The selected trial uses application EC2 `34.196.37.78` without changing its
instance size. At the second inspection it had 1,179 MiB available memory,
4,929 MiB unused swap, 24 GiB free disk, and approximately 98% idle CPU.
The separate manager `personal-agentic-ci-runner` uses private configuration in
`/srv/personal-agentic-ci/config`. Its token file has root-only permissions.
The existing runner and its other projects are retained. This project has no
CI secret variables and the EC2 has no IAM instance profile. Jobs have no
production credentials or application data mounts. Normal DNS, HTTP and HTTPS
egress is needed for Git and packages.

Runner #3 is locked to personal-agentic with tag
`personal-agentic-ci`, `run_untagged=false`, and `access_level=not_protected`
so the current integration MR can run. It was created paused and registered
with the authentication-token workflow before activation. The generated token
stays on the server outside Git and logs. Global runner concurrency is one.
The registration used
[runner.template.toml](../infra/gitlab-runner/runner.template.toml), which
limits the one job to one CPU, 1 GiB RAM and 4 GiB combined RAM/swap, and mounts
only `/cache` as an explicitly configured volume. GitLab also supplies its
Docker-managed `/builds` checkout volume. Cargo compiles one job at a time;
backend CI allows two hours. The host already has 6 GiB swap. The trial raised
the job's combined allowance from 3 to 4 GiB as Lance compilation approached
the original limit; the physical RAM and CPU limits did not change.
Backend CI overrides the Windows development `PROTOC` path with
`/usr/bin/protoc`. Cargo dependencies and build output persist in this project's
Docker-managed `/cache` volume, with the target directory scoped to Rust 1.94
and ARM64. Neither cache path is committed to the repository.
The backend job installs LLD and selects it through a container-local `cc`
driver wrapper. Rust compile flags stay the same so existing dependency
artifacts can be reused. The job links a small executable and prints its ELF
linker metadata before running the full workspace suite. Verbose Cargo output
shows which dependency artifacts are reused.
Jobs use their own Docker network and remain unprivileged. The runner manager
uses the current host's Docker socket; that socket is not mounted into
job containers.

The checked manager image is
`gitlab/gitlab-runner:v19.2.1@sha256:ef3fe28f71a5f3aae1a9dcd6e2494e6e42ada004f1e12ca04202d82a2afa9877`.
Its manifest includes `linux/arm64`. The template is for the three existing
verification jobs; image publishing and production deployment require later
configuration. After activation, require the real MR pipeline to complete
successfully and record the runner ID, job results, architecture, and measured
resource use before marking CI ready. Check AGY responsiveness during builds:
cancel the active project job and pause this project's runner if probes repeatedly
exceed the existing four-second discovery timeout, a job is OOM-killed, or other
workloads cannot be served. Pausing a runner alone does not stop an active job. A
separate builder remains an option if measurements show this host is inadequate;
no additional EC2 instance or upgrade is authorized for this trial.

The first real MR pipeline, #12, passed frontend and SSH bridge verification. Backend
compilation failed because the Windows `PROTOC` default selected a nonexistent
executable in Linux, despite `protobuf-compiler` being installed. The Linux CI
override corrects that environment error. During the trial the AGY version probe
continued to return successfully in under 0.2 seconds. The subsequent trials
below verify the corrected Linux environment and resource limits.

Pipeline #13 passed frontend and SSH bridge checks, and completed backend source
compilation, but GNU `ld` was killed with signal 9 while linking the test binary
after approximately 48 minutes. Backend CI now uses LLD for that link step.
The instance size remained unchanged.

[Pipeline #14](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/pipelines/14)
passed all three verification jobs on runner #3 for commit
`f48a72ae551f2eef9a5ecb296205e8200afc2669`. Its traces record 203 cockpit tests,
12 workdir tests, 117 Rust tests and 24 SSH discovery tests, with no failures or
skipped/ignored tests. Frontend lint and build also passed.

The backend job reused Lance, FastEmbed and LanceDB artifacts (`Fresh` in Cargo
output), selected Debian LLD 14.0.6, and finished in approximately nine minutes.
During the linking samples, RAM peaked at the 1 GiB job limit, observed peak
swap was 1,656 MiB, and the cgroup OOM counter remained zero. AGY process probes
in that linking phase took approximately 0.17–3.41 seconds. After the pipeline,
the host had approximately 16 GiB free disk. Full agent execution alongside a
build and production image publishing/deployment remain separate checks.

Sources: [runner registration templates](https://docs.gitlab.com/runner/register/#register-with-a-configuration-template),
[Docker executor](https://docs.gitlab.com/runner/executors/docker/).
Linker references: [LLVM LLD](https://lld.llvm.org/) and
[GCC linker selection](https://gcc.gnu.org/onlinedocs/gcc/Link-Options.html).

### Registry and ARM64 image preparation

The existing GitLab host provides `https://registry.tugasakhir.space`.
Its HTTPS `/v2/` endpoint returned the expected HTTP 401 Bearer challenge on
2026-10-08; GitLab's HTTPS sign-in endpoint returned HTTP 200. No registry service
was installed on the workspace host. The workspace host remains the builder
and intended production host; GitLab stores source and published images.

`registry_auth` exercises the registry through the real GitLab job credential.
It checks unauthenticated access, the trusted GitLab authentication endpoint,
project-scoped `pull,push` permission, an authenticated registry request, and a
real empty blob upload initiation/completion (HTTP 202/201), followed by a
HEAD request proving HTTP 200 and zero bytes. The upload URL must stay on the
same HTTPS registry and repository path. The stable empty blob is reused across
probes; each upload session is completed using only `pull,push` permission.
Credentials never enter its output or artifacts. This check alone does not
prove that an image was uploaded.

Verification jobs export their checked frontend and a stripped native ARM64
controller binary compressed with single-threaded XZ. A real build initially
failed artifact upload with HTTP 413: its debug-stripped binary was 470 MiB.
Removing unneeded symbols and compressing the binary reduced the transfer to
43,033,244 bytes. The image job decompresses it before packaging and selects
`frontend-ci` and `backend-ci` in the
existing Dockerfile, avoiding a second compilation of the Rust dependency tree.
Normal Docker builds still compile source using the existing default stages.
Runtime libraries and the AGY executable are installed through the existing
Dockerfile. The installer copy of AGY is removed in the same build step after
installing `/usr/local/bin/agy`, keeping a single executable in that layer.
Provider credentials and application state stay outside the image.

`image_publish` is automatic only on protected `main`. The integration MR has
an explicit manual trial required for this same project's integration branch;
other feature branches do not publish images.
The result is tagged with the full commit SHA and records its registry digest.
The BuildKit publisher removes only the default HTTPS `:443` suffix from its
registry address and credential lookup. The smoke image keeps GitLab's original
registry address so Runner can match its automatically supplied job credential;
the verification allowlist admits this project's digests with either spelling.
`image_smoke` uses that digest as its Docker-executor image and starts the actual
controller with disposable state. It checks backend/ONNX dynamic libraries,
health, rejected authentication,
owner login, workspace/cockpit responses, logout revocation, frontend bytes,
the source AGY SVG hash and the bundled CLI. Production deployment is not part
of these jobs. MR publishing is not a release approval. Failed publishing stops
the smoke job; the pipeline waits for the integration trial to be played.

The host security configuration was explicitly approved on 2026-10-08.
The template is `infra/gitlab-runner/image-runner.template.toml`, using
the pinned BuildKit 0.34.0 rootless image, UID 1000, no host Docker socket,
no production state mounts, and the existing 1 CPU/1 GiB/4 GiB combined limits.
Register it in the existing manager with global `concurrent = 1`, so verification
and packaging cannot run simultaneously. The verification runner's seccomp and
AppArmor settings remain unchanged; its image allowlist additionally admits only
this project's platform digests for the smoke job.

Default Docker confinement rejected the rootless namespace probe. The proposed
dedicated profiles preserve the default seccomp rules except for `clone`,
`unshare`, `mount`, `umount2`, `setns`, `pivot_root`, and `sethostname`; AppArmor permits those
builder operations while retaining sensitive `/proc` and `/sys` write denials.
Neither profile is unconfined. The seccomp baseline was downloaded from
`moby/profiles/main/seccomp/default.json` on 2026-10-08; record/review the baseline
against the host's Docker 29.7.2. A bounded native ARM64 build ran `RUN id && touch`
and exported an OCI image successfully with these enforced profiles. The outer
builder used UID 1000 and `CapEff: 0000000000000000`; only its own user namespace
sees UID 0. Runner #4 is locked to this project and was registered paused in the
existing manager. Automatic approval review required separate explicit approval
for the persistent profiles and `sethostname`; both approvals were obtained.
The CI wrapper uses runc's `--no-new-keyring` so `keyctl` stays denied.

Load the host AppArmor profile and put the seccomp JSON under
the manager's existing root-private configuration mount at
`/etc/gitlab-runner/security/buildkit-seccomp.json`. Runner 19.2.1 reads that JSON
inside the manager (`seccomp=/absolute/path`, with `=`); AppArmor resolves on
the Docker host. Prove namespace startup and a small real build first, then
register the project-only runner with tag `personal-agentic-image`. Prove the
manual MR publish and digest smoke before considering a merge to `main`.
Keep registry auth files in temporary job storage and remove them on exit.
Before protecting the image runner for release-only execution, remove the MR
trial rule after its proof. Never give unreviewed MR jobs a host Docker socket.

References: [GitLab BuildKit](https://docs.gitlab.com/ci/docker/using_buildkit/),
[dotenv variables](https://docs.gitlab.com/ci/variables/dotenv_variables/),
[BuildKit rootless](https://github.com/moby/buildkit/blob/master/docs/rootless.md).

### Local Git connection

The repository remotes are `origin` (GitLab), `github` (the private downstream
copy), and `upstream` (the original public GitHub project). The integration
branch tracks `origin/codex/dev-prod-integration`. Develop and push to GitLab:

```powershell
git switch -c codex/my-change
git push -u origin codex/my-change
```

Open a merge request in GitLab. Changes reach GitHub through the configured
push mirror after synchronization; compare commit SHAs when checking a release.
Do not use direct GitHub pushes as the normal development path.

On the current Windows laptop, the GitLab SSH alias routes through the existing
GitLab-server SSH connection to its loopback Git port. No additional inbound
port was opened. A repository-scoped deploy key is used for Git access. Its
private key remains encrypted; its unlock credential is protected with
user-specific Windows DPAPI and ACLs. A local SSH helper reads that credential
only for this GitLab alias and removes its temporary askpass file after use.
These files live under the user's `.ssh` directory, outside the repository.
Another laptop requires its own credential setup; the DPAPI file is not a
portable repository secret.

### Source verification

The reconciled source passed web lint/format/build, 203 cockpit unit tests,
12 workdir selection tests, and 24 Antigravity discovery tests. The Docker
verification target built using matching cached Rust verification layers.
A newly built platform image was also run with isolated fresh application
state: health, authenticated state, root UI and AGY asset returned HTTP 200;
unauthenticated state returned HTTP 401. The served AGY SVG hash matched the
source file. The isolated smoke container was stopped after verification.

`ssh-timeout.py` and `remote_watchdog.py` require actual configured runtime
environments and remain manual checks. They are not generic CI jobs. Local
verification does not substitute for successful GitLab runner execution.

References: [GitLab deployment safety](https://docs.gitlab.com/ci/environments/deployment_safety/)
and [GitLab container registry](https://docs.gitlab.com/user/packages/container_registry/).
