# Live Office change contracts

Status: owner-approved implementation delivered as three local commits on
`codex/live-office-idle-and-activity`. No push, deployment, archive or main-spec sync.
The owner authorized the branch and local commits after review; earlier no-commit
notes describe the implementation/verification phase, not the current authorization.
No GitLab issue ID is linked from these local drafts; this review did not create
or query a remote issue. The existing .gitignore intentionally
keeps untracked OpenSpec content ignored. These selected contracts are explicitly
versioned; unrelated archives and runtime evidence remain excluded.

Read in order. A later owner-approved change supersedes earlier conflicting text;
checked historical tasks do not re-enable removed behavior.

| Change | Still effective | Superseded choices |
| --- | --- | --- |
| [align-live-office-idle-behavior](changes/align-live-office-idle-behavior/proposal.md) | Pantry/pot anchors, desk-mat removal, scene-to-card activity, reference dialogue cadence | Temporary leisure feed; initial guitar transform |
| [describe-live-office-work-activity](changes/describe-live-office-work-activity/proposal.md) | Safe native metadata, real work-only persisted history, 100 deduplicated steps, seconds, legacy enrichment | Run navigation and step/tool badges |
| [refine-live-office-presentation](changes/refine-live-office-presentation/proposal.md) | Passive feed, immediate Santai, clear cards, uniform bounded bubbles and right-handed guitar contacts | Overrides conflicting earlier presentation requirements |

Effective acceptance: leisure only on cards/details; feed contains actual work,
without links/badges. Actual outcomes remain in Riwayat. Desktop work/event previews
use 48 graphemes; mobile (up to 820px) hides non-dialogue bubbles. All bubbles are
white. Guitar grips follow an unreflected prop with an upward anatomical-left neck.
Beres requires a matching explicitly succeeded observed run; failed/cancelled
results never imply success speech. Current routes are /office and /organization/live-preview; overlay acceptance is
legacy. Auth, privacy, provider execution and workspace boundaries remain intact.

Historical proofs stay in each change; current proof/limits and commit grouping
are summarized in [review and commit plan](../src/cockpit/docs/live-office-review.md).
Run `openspec validate --all --strict` before including the contracts. Do not archive
or synchronize specs as part of cleanup; those are separate owner decisions.
