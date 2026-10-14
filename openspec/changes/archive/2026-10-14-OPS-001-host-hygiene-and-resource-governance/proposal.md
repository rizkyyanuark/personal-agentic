# Proposal: OPS-001 — Scoped host maintenance and measured capacity

Tracking: [GitLab Issue #7](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/7).

Owner decision: [ADR 0002](../../../../docs/decisions/0002-host-hygiene-and-resource-governance.md).
The accepted direction permits automatic cleanup only of proven-safe owned
cache/images; volumes and chat history remain manual. This change replaces the
draft's unscoped daemon prune commands after the source/evidence review.

## Problem and outcome

Production, Matrix and two projects' runner managers share the host. Existing
production limits are 0.5 CPU/512 MiB RAM/1 GiB combined memory+swap per service;
personal-agentic's manager bounds its own jobs but does not establish a shared
host budget. Historical reclaimable-image totals and idle memory snapshots are
not deletion permission or capacity evidence.

Operators need an explicit plan of obsolete platform images, safe application
and workload measurements. The daily maintenance path can remove eligible images
without stopping production; current, previous, pending and all container images
remain protected. Zero proven candidates is a valid result.

## Scope and non-goals

Minimum files: `infra/ops/maintenance.py`, `measure.py`, operator README, optional
systemd service/timer, focused tests and this contract/evidence. Existing release
helper, Compose and runner resource limits are reused without modification.

The actual cache inventory includes Docker runner `/cache` volumes, per-job
rootless BuildKit and registry cache. No disposable owner-scoped cache store has
been proved, so cache deletion is excluded rather than replaced with a global
builder prune. Automatic volume/network/container deletion, chat retention,
backup/config/key cleanup, other projects, hardware changes and universal runner
scheduling are outside scope.

## Requirements and scenarios

### REQ-OPS-001-1: explicit owner and protected-reference plan

Given the root-private verified production configuration/journals and actual
Docker metadata, planning includes only full immutable image IDs with the exact
OCI source, full revision and exclusively owned repository references. The
minimum creation-age grace is seven days; dangling/reclaimable/age alone do not
prove ownership. Configuration, current/previous/pending/predecessor identities
and every container, including stopped containers, protect their images.
Missing protected images, invalid/redirected/public journals or ambiguous
configuration fail clearly. `:443` registry aliases resolve to the same owner.

### REQ-OPS-001-2: conflict and freshness refusal

Given a release holds `release.lock`, maintenance cannot acquire it. Given a
pending journal, active/created/paused/restarting runner job or observed native
Cargo/Rust/BuildKit process, automatic cleanup defers. Given an apply plan older
than ten minutes or changed candidate/release/container/volume references,
application refuses without widening the plan. Checks occur before each deletion.
Idle runner managers can remain active; no host-wide scheduling exclusion is
claimed. Docker's atomic non-force in-use guard is the final race protection.

### REQ-OPS-001-3: bounded safe deletion and honest proof

Given a current explicit plan, application removes only the selected ID via
`docker image rm --no-prune`, without force or parent pruning. Protected releases,
all existing containers/volumes and foreign images remain unchanged. An empty
plan succeeds. Exact removed IDs, image-size sum and filesystem-free delta are
reported separately; shared layers/other I/O prevent guaranteed reclaimed-byte
claims. Partial success records each removed ID before a later refusal.

### REQ-OPS-001-4: named workload measurement

Given a named actual workload window, measurement records production HTTP
outcomes/latency, minimum available RAM, swap in/out page deltas, I/O wait and
pressure, disk/inodes, OOM/restart/production-identity changes and configured
container limits. An idle/background window does not establish peak or concurrent
project capacity. Health/OOM/restart problems produce a warning, not an arbitrary
disk/swap percentage guarantee. Existing resource bounds remain unchanged.

### REQ-OPS-001-5: practical optional automation

Given reviewed source and a successful operator plan/proof, the optional daily
timer invokes fresh-plan application under the same release lock, with 10% CPU,
128 MiB RAM, low I/O weight and a three-minute bound. Active work defers; safety
errors fail visibly in the journal. It does not pause runners or services.
Installation/enabled state and actual execution are recorded separately from
source/test acceptance; the timer can be disabled without changing product data.

## Acceptance and references

[Tasks](tasks.md), [verification](verification.md) and [operator path](../../../../infra/ops/README.md)
record implementation and real proof. Evidence distinguishes inspected source,
actual daemon fixtures, read-only production plans, workload scope and installation.
The physical Docker smoke uses explicit tiny OCI fixtures and actual transport;
it never deletes a real release image to manufacture proof.
