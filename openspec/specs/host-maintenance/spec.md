# Host maintenance

## Purpose and baseline

Retrospective baseline recorded on 14 October 2026 from the implemented
[OPS-001 contract](../../changes/archive/2026-10-14-OPS-001-host-hygiene-and-resource-governance/proposal.md).
[OPS-001 evidence](../../../docs/evidence/ev-009-ops-001-maintenance-verification.md)
distinguishes actual Docker acceptance, installed timer/service and observed load.
The operator path is in [infra/ops](../../../infra/ops/README.md).

## Requirements

### Requirement: Cleanup enrolls only proven owned images

Maintenance SHALL plan only immutable image IDs with the fixed platform repository,
exact OCI source label, full revision and a minimum seven-day creation-age grace.
Configuration/current/previous/pending/predecessor release identities and every
container image, including stopped containers, SHALL remain protected. Missing or
invalid private journals and incomplete image inventory SHALL refuse cleanup.

#### Scenario: An image is old but ownership is unproven

- **WHEN** metadata or references cannot establish exclusive platform ownership
- **THEN** the image remains outside the deletion plan

### Requirement: Application revalidates release and workload state

Maintenance SHALL share the release lock, expire explicit plans after ten minutes,
and check release/candidate/container/volume references before deletion. A pending
release, active runner job or observed native Cargo/Rust/BuildKit process SHALL
defer cleanup. Exact deletion SHALL use non-force `docker image rm --no-prune`.

#### Scenario: A plan becomes stale or busy

- **WHEN** references change, the plan expires, or release/build work becomes active
- **THEN** application refuses or defers rather than widening the deletion plan

#### Scenario: No images qualify

- **WHEN** a fresh inventory has no eligible candidates
- **THEN** maintenance succeeds without removing any resource

### Requirement: Cleanup preserves product and foreign state

Automatic maintenance SHALL exclude cache stores whose disposable ownership has
not been established, foreign images, all volumes, containers, networks, chat
history, backups, configuration and keys. Proof SHALL distinguish exact removed
IDs, removed image-size sum and observed filesystem-free change. Partial removal
SHALL log each completed ID before a later refusal.

#### Scenario: An obsolete owned image is removed

- **WHEN** its fresh plan and Docker in-use guard permit deletion
- **THEN** only that explicit ID is removed while protected resources remain unchanged

### Requirement: Automation and capacity evidence remain bounded

The optional daily service SHALL invoke fresh-plan application under the shared
lock, with 10% CPU, 128 MiB memory, low I/O weight and a three-minute service bound.
The timer SHALL use 03:15 Asia/Jakarta plus up to thirty minutes of random delay.
Named workload measurement SHALL record health/latency, memory, swap traffic,
I/O pressure, disk/inodes, OOM/restart and production identity changes. Health or
identity problems SHALL produce visible warnings.

#### Scenario: An operator observes a CI workload

- **WHEN** measurement runs during that named workload window
- **THEN** it reports observed host and production outcomes for that window without treating idle measurements as peak capacity

## Verified boundary

Actual Docker proof removes tiny owned fixtures and compares pre-existing image,
container and volume identities. The installed service/timer and a no-candidate
execution are verified separately. No cache store is enrolled in automatic cleanup.
Service cgroup limits bound the maintenance process; they do not reserve host-wide
capacity or constrain every Docker daemon operation. Per-project CI concurrency
does not exclude other projects, and a job can begin after a busy-state sample.
