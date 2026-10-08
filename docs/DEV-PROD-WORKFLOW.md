# Dev and production workflow

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
   release source of truth; keep GitHub as an upstream remote if needed. Protect
   `main`, require merge requests, and restrict who can push release tags.
3. Develop on `feature/*` branches. Merge-request pipelines run Rust format and
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

The existing runner must not execute arbitrary merge-request code with the
production Docker socket attached. Move builds to an isolated ARM64 builder
before production activation. Neither the nearly full GitLab host nor the
shared 2 GB application host is a suitable default for sustained Rust image
builds alongside production. Select builder capacity after measuring a build;
no server resizing or runner migration has been performed by this audit.

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

Source reconciliation → private GitLab project → isolated build runner →
registry authentication/routing → CI checks and ARM64 image proof → fresh
production bootstrap → DNS/TLS → manual production deployment → real app proof.

## Repository initialization

The reconciled development source is prepared on `codex/dev-prod-integration`.
The private GitHub destination is
`https://github.com/rizkyyanuark/personal-agentic`; the GitLab destination is
`https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic`.
The original `tirta-ir/personal-agentic-enterprise` remains the upstream source.

GitLab is the canonical destination for development pushes and merge requests.
GitHub is intended as a downstream push mirror, with divergent refs preserved.
Do not edit the GitHub mirror independently. Repository access and mirroring
must be configured and verified before claiming automatic synchronization.

The initial `.gitlab-ci.yml` checks frontend/cockpit, Rust, and the SSH bridge.
It requires a runner tagged `personal-agentic-ci`, without production Docker
socket access or production credentials. Until such a runner is registered,
jobs remain pending. No production deploy job is included at this stage.

Production service, DNS, deployment identity and image promotion remain later
activation steps. Repository initialization does not deploy the application.

### Local Git connection

The repository remotes are `origin` (GitLab), `github` (the private downstream
copy), and `upstream` (the original public GitHub project). The integration
branch tracks `origin/codex/dev-prod-integration`. Develop and push to GitLab:

```powershell
git switch -c feature/my-change
git push -u origin feature/my-change
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
