# Scoped host maintenance

`maintenance.py` is a root-operated CLI for the existing production Docker daemon.
It lists explicit immutable platform-image candidates, then revalidates references
before removing each ID with `docker image rm --no-prune`. It never uses force,
global prune, filesystem cache deletion, volume deletion or chat retention.

An image needs the exact repository's OCI source label, a full revision, only
references in the fixed platform repository, and an image creation age of at
least seven days. Age is an additional grace period, not ownership or last-use
proof. Every container, including stopped containers, protects its image.
Configuration and current/previous/pending journals protect release identities;
an incomplete inventory or any pending release refuses cleanup. `:443` and the
default HTTPS registry identity are treated as aliases.

The CLI holds the same production `release.lock` as the release helper. Active
runner jobs on any project, including created/paused/restarting containers, and
observed native Cargo/Rust/BuildKit processes defer cleanup. It rechecks container,
volume and release references immediately before each deletion. An idle runner
manager can remain running. A job can start after the sample; Docker's non-force
in-use guard provides the final container-reference protection. This does not
provide host-wide CI scheduling exclusion. Shared tags can make Docker refuse
removal, which requires operator review rather than force.

The implementation deliberately excludes runner `/cache` volumes, per-job
rootless BuildKit stores and registry caches. They have different owners and
retention mechanisms. None has been enrolled as a proven disposable maintenance
store. A daemon builder prune would not target the actual CI stores safely.
Backups, config, keys, all Docker volumes and Matrix history stay outside cleanup.

## Operator path

Inspect a dry-run first; its JSON contains identifiers and reasons, not private
configuration values. Save an apply plan as root with mode `0600`:

```sh
sudo sh -c 'umask 077; /usr/local/sbin/personal-agentic-maintenance plan > /opt/personal-agentic/maintenance-plan.json'
sudo /usr/local/sbin/personal-agentic-maintenance apply --plan /opt/personal-agentic/maintenance-plan.json
```

Plans expire after ten minutes. Changed candidates/references, active work,
missing protected images or private-file permission/symlink failures refuse
application. Zero candidates is a valid successful result. Output distinguishes
the sum of removed image sizes from measured filesystem free-space change; shared
layers and other host I/O prevent interpreting either as guaranteed reclaimed
bytes. A partial deletion logs each removed ID before any later refusal.

The optional daily timer runs `automatic`: it records a fresh dry-run, applies
the same checks under the lock and logs exact removed IDs. Active work returns
`deferred` without deletion; a failed safety check exits nonzero. Running idle
managers do not disable the timer. Review the plan/proof and check paths before
installing:

```sh
sudo install -o root -g root -m 0755 infra/ops/maintenance.py /usr/local/sbin/personal-agentic-maintenance
sudo install -o root -g root -m 0644 infra/ops/personal-agentic-maintenance.service infra/ops/personal-agentic-maintenance.timer /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/personal-agentic-maintenance.service /etc/systemd/system/personal-agentic-maintenance.timer
sudo systemctl daemon-reload
sudo systemctl enable --now personal-agentic-maintenance.timer
sudo journalctl -u personal-agentic-maintenance.service --no-pager
```

The timer uses 03:15 Asia/Jakarta with up to 30 minutes of random delay. The
proposed service is bounded to 10% CPU, 128 MiB memory, low I/O weight and
three minutes. It does not stop production or runners. Timer activation is a
separate operational result; source files alone do not prove it is installed.
Disable with `sudo systemctl disable --now personal-agentic-maintenance.timer`.

## Measurement and proof

```sh
python3 -B infra/ops/tests/maintenance_test.py
python3 -B infra/ops/tests/measure_test.py
sudo python3 -B infra/ops/tests/docker_smoke.py --allow-isolated-image-fixture
sudo python3 -B infra/ops/measure.py --workload 'actual named workload' --samples 20 --interval 3
```

The Docker smoke imports four tiny local OCI images and creates one unstarted
fixture container; it performs no build, pull, provider call or application run.
It uses the actual Docker transport, filesystem, lock and deletion implementation.
Only its repository/source/private release root/creation-age policy differ from
production. It exercises expired/changed/pending/CI/native-build refusals and
deletes only its obsolete image. It compares every pre-existing image/container/
volume identity and checks real production health before cleaning its fixtures.
This opt-in smoke needs the Docker containerd OCI image store; the production CLI
does not depend on fixture support. Run it only through an authorized operator.

The sampler regression uses a real loopback HTTP contract fixture and actual
Linux counters for ready/outage/invalid-body cases. It is separate from the
observed real production health window.

`measure.py` records a named window: production HTTP outcomes/latency, available
RAM, swap page traffic, I/O wait/pressure, free bytes/inodes, kernel OOM counters,
container limits, restart deltas and production identity changes. It does not
declare spare build capacity from idle percentages. Measure the actual bounded
CI job window again when assessing concurrent-project capacity. Existing Compose
and runner limits remain unchanged.

For a long CI window use a new private output directory, `--samples 1440
--interval 5 --progress-file /path/samples.jsonl --stop-file /path/stop`. Each
sample is flushed to mode0600 JSONL so partial observations survive interruption.
When the observed pipeline reaches a terminal state, the operator creates the
stop marker; the sampler returns its measured summary after at least two
samples. The maximum sample count still bounds an unattended window. Reuse
neither a previous stop marker nor a previous progress file for a new workload.

Docker semantics: [image removal](https://docs.docker.com/reference/cli/docker/image/rm/)
and [builder-specific cache pruning](https://docs.docker.com/reference/cli/docker/buildx/prune/).
Historical contract: `OPS-001`, retained in the local OpenSpec archive and not
included in a fresh clone. The operational commands and checks are documented in
this runbook.
