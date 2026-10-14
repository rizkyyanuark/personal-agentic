# Tasks: OPS-001

[Proposal](proposal.md) · [Verification](verification.md)

- [x] T-OPS-1 (REQ-1): inventory actual release/image/container identities and CI cache stores; replace unscoped prune with explicit owner/candidate logic.
- [x] T-OPS-2 (REQ-1/2): reuse release flock, protect configured/current/previous/pending/predecessor and all container images, validate private journals and full metadata.
- [x] T-OPS-3 (REQ-2/3): implement dry-run, ten-minute plan validity, conflict/freshness rechecks, exact non-force `--no-prune` removal, partial-ID logging and empty-plan outcome.
- [x] T-OPS-4 (REQ-1/2/3): execute focused Linux regressions and actual Docker fixture acceptance; compare all pre-existing resource identities and production health.
- [x] T-OPS-5 (REQ-4): implement named workload sampler and observe real production background/health window; document its capacity limits and existing historical CI bounds.
- [x] T-OPS-6 (REQ-5): prepare low-resource daily service/timer and operator install/disable/journal path.
- [x] T-OPS-7 (REQ-5, depends on T-OPS-4/review): reviewed, installed exact source root0755, verified/enabled timer and captured actual manual-service, journal, protected identities and production HTTP proof in ev-009. Merge/image release is a separate result.

No cache store passed ownership/deletion enrollment. Cache deletion, all volume
deletion and chat retention are outside this implementation; they are not pending
features hidden behind a successful image-cleanup result. Peak concurrent-project
capacity remains unverified and is not promised by this change.
