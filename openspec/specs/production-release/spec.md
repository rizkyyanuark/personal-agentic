# Production release

## Purpose and baseline

Retrospective baseline recorded on 14 October 2026 from implemented source and
the accepted [CI-003 contract](../../changes/archive/2026-10-14-CI-003-simple-automatic-releases/proposal.md).
The requirements describe application and operator behavior. They do not claim
that the integration branch's next application image has been merged or deployed.
Installed-helper and image-release results are separate in
[CI-003 evidence](../../../docs/evidence/ev-011-ci-003-managed-state-backup.md).

## Requirements

### Requirement: Verified automatic promotion

The pipeline SHALL deploy automatically only from protected main after source
verification, immutable Linux ARM64 image publication and image smoke succeed.
Promotion SHALL match the tested repository digest, full commit SHA and source
asset hash. The deploy client SHALL reject main that has advanced at job start.

#### Scenario: Protected main produces a tested image

- **WHEN** a merge reaches protected main and its required jobs succeed
- **THEN** deployment uses the smoke-tested digest and verifies matching release evidence

#### Scenario: An unprotected or outdated source attempts deployment

- **WHEN** the source is unprotected or main differs from the deployment commit
- **THEN** the client refuses promotion before calling the production helper

### Requirement: Operation-specific safety checks

The helper SHALL serialize operations with the production release lock and
refuse promotion while active, queued or waiting application work, terminal work
or indexing exists. A new backup SHALL require valid managed sources, the selected
runtime key and enough disk capacity before shutdown and again during backup.
Status and recovery of an existing transaction SHALL not require a new backup.

#### Scenario: Backup preflight fails

- **WHEN** a required volume, runtime key or backup capacity check fails
- **THEN** promotion refuses before stopping services

#### Scenario: Existing recovery needs no additional backup

- **WHEN** an existing transaction satisfies its identity, archive, schema and journal checks
- **THEN** recovery verifies that transaction without creating another state archive

### Requirement: Managed-state backup and compatible validation

A stopped-state backup SHALL include platform-data, matrix-data, internal
platform-workdir, controller home, production configuration, Compose and the
selected runtime key. Format 2 SHALL validate exact supported archive/private-file
sets and their hashes. Legacy backups SHALL retain their existing validation path.
External project sources and external runtime provider authentication SHALL remain
outside the controller backup boundary.

#### Scenario: Format 2 backup completes

- **WHEN** platform and Matrix are stopped and backup succeeds
- **THEN** the private manifest records the three volume archives, controller-home archive and private configuration/key hashes

#### Scenario: An archive or transaction is incompatible

- **WHEN** format, archive set, hash, schema or transaction identity is unsupported or changed
- **THEN** recovery refuses without restoring data or silently accepting the mismatch

### Requirement: Authenticated verification and explicit recovery

Activation SHALL verify running image identity, health, owner authentication,
application state, cockpit, UI, source asset and logout revocation. Failure SHALL
retain diagnostic context privately while CI receives a bounded safe category,
stage and diagnostic reference. A pre-replacement failure SHALL resume existing
source containers with `compose start` only when its verified image, schema, state
and journals are unchanged, preserving their writable home without reconciling
pending Compose changes. Successful activation SHALL apply the image/configuration
with `compose up` after backup completes. Recovery
SHALL verify the running candidate; image rollback SHALL require explicit database
risk acknowledgment and compatible recorded schema.

#### Scenario: Stopped-state backup fails before image replacement

- **WHEN** backup fails and the verified source guards still hold
- **THEN** the helper starts existing source containers, verifies them and retains any incomplete private backup without recreating containers

#### Scenario: An existing source container cannot start

- **WHEN** a container is missing or its start fails during source resume
- **THEN** the helper reports source-restart failure and retains both diagnostics for operator recovery without creating a replacement

#### Scenario: Candidate verification fails

- **WHEN** startup or authenticated verification fails after activation
- **THEN** the backup and pending transaction remain available for operator recovery without automatic database restore

## Verified boundary

Actual stopped Docker backup and installed-helper status/unchanged recovery are
recorded in the linked evidence. Source checks, image smoke and production release
remain distinct results. Drain is absent: work admitted between the final busy
check and stop can still be interrupted. Stop/backup/restart causes a service gap.
Controller home is backed up but is not yet a persistent volume; its restoration
is an administrator operation. Helper/Compose installation is separate from image
promotion. The [deployment runbook](../../../docs/deployment.md) defines that path.
