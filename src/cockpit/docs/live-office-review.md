# Live Office diff review and commit plan

Original review: 2026-11-02. Worktree `3e0b/personal-agentic`, then detached at
`6f6947c`. Canonical origin is the configured GitLab SSH remote; github remains
a downstream remote. The original review created no branch or commit.

Current delivery: the owner subsequently authorized branch
`codex/live-office-idle-and-activity` and the three local commits listed below.
Runtime evidence, state and secrets remain ignored. No push, deployment, GitLab
issue/MR, OpenSpec archive or main-spec sync was performed.

## Scope reviewed

Reviewed the accumulated native activity capture/projection, generated bindings,
scene layout/pose, dialogue scheduler, HUD/snapshot/bubbles, six real-browser
harnesses, unit regressions and documentation. Existing source entrypoint is
StandaloneOffice at `/office` and `/organization/live-preview`, not an overlay.
No dependency, migration, permissions, queue or deployment change is introduced.

## Findings and cleanup

1. Fixed stale entrypoint/privacy documentation in root/cockpit README and cockpit
   architecture. The architecture map now points to StandaloneOffice and mount.js.
   Public safe snapshot reads and owner-only setup/mapping are described separately.
2. Reconciled OpenSpec using previously approved owner decisions: leisure stays
   on cards/details; feed is real work history without run links/badges; immediate
   Santai, uniform bounded bubbles, mobile suppression of every non-dialogue kind,
   right-handed rigid guitar contacts. Historical tasks and receipts are preserved
   with explicit supersession notes; effective deltas no longer require the removed
   leisure feed or run navigation. The root OpenSpec index records precedence.
3. Removed the temporary AE_TEST_RESUME branch and readFile import from the maintained
   presentation suite. Each fresh invocation now creates and observes an actual
   provider task; earlier receipts remain historical, not reusable test success.
   Formatted all five newly added browser suites; syntax checks pass.
4. Removed EOL-only Workstation.ts churn after verifying normalized content exactly
   equals HEAD. No actual binding content was reverted. Simplified generated local
   OpenSpec config to its actual `schema: spec-driven` setting.
5. No debugger, console.debug/trace, dbg!, TODO/FIXME placeholder or fake success was
   found in the scoped source scan. CLI status logs are purposeful test progress.
   Three devtools observers live only in test scripts and read the real scene;
   they do not replace providers/APIs or force poses into production.
6. No generated logs, build output, node_modules, org DB, owner key, local fixture,
   screenshot or ad hoc scratch helper is proposed for commit. Existing ignored
   evidence/state is retained: deleting the running fixture would destroy proof
   and local data. The reproducible six browser harnesses are tests, not scratch.
7. OpenSpec is intentionally ignored by the existing .gitignore. Keep that policy;
   the authorized documentation commit explicitly includes only the listed contracts,
   config and index. Do not force-add the entire workspace or unrelated archives.

## P2 review finding: resolved by owner-approved follow-up

**P2, pre-existing: completion bubble infers success from idle.** In
`src/client/mount.js`, the lifecycle branch for Bekerja -> siaga/selesai emits
Beres without checking the terminal run outcome. The backend normalizes terminal
failures/cancellation to idle. Thus a failed/cancelled run can potentially produce
that optimistic bubble even though the card/feed retain factual failure data.
The condition and wording existed at HEAD, so this was not introduced by the
original diff. The owner subsequently authorized correcting it: actual succeeded
outcome must match the observed working run ID. This is now implemented and real
success/failure/cancel cases verify Beres counts 1/0/0. See
[completion verification](../../../openspec/changes/refine-live-office-presentation/verification-completion.md)
for implementation, run IDs, automatic review distinction and remaining limits.

The baseline also references missing general `docs/development.md` and
`docs/deployment.md`; those repository-wide documentation gaps predate this batch.
They were not replaced with placeholders. This review repairs Live Office-specific
links only. The existing overlay wrapper/suite remains intentionally legacy.

## Verification

Current cleanup checks and real app receipts are under ignored
`scratch/live-office-review/`; earlier proof remains under `scratch/live-office-idle`,
`live-office-work-activity` and `live-office-presentation`.

- `npm run check` in cockpit: lint, format, 226 tests and build pass.
- Frontend `npm run lint` and `npm run build`: pass; three existing lint warnings
  and the existing Vite large-chunk advisory remain.
- `cargo fmt --all --check` using the installed cargo executable: pass. Rust source
  was not edited in cleanup; the earlier source-built 168-test receipt is retained,
  not represented as a new Rust test run.
- `node --check` for all five Live Office browser scripts: pass.
- `openspec validate --all --strict`: all three changes pass. Progress remains
  22/22, 7/7 and 4/4. No archive or main-spec sync occurred.
- `git diff --check`: pass. Index remains empty; no secrets or generated/runtime
  artifacts are included in the commit manifest.
- Real standalone context E2E: receipt `context/context-proof.json` checks actual
  API/auth, camera, pantry occupancy, reduced motion, offline recovery, workspace
  and filter isolation, remount and unchanged runs/profiles. No new provider task.
- Previous user-observed real task `113093eb-681f-479c-9161-fd8e42cade05` read three
  files separately and ran npm test: four exit-0 commands, one test passed, zero
  failed. Native receipt and UI observations remain in live-review-proof.json.

## Authorized local commit sequence

The P2 completion gate is resolved with local proof. The owner authorized this
sequence, and the branch preserves the reviewed baseline. Only the exact paths
below are included in these commits; no broad staging was used.
Do not include runtime receipts, secrets or other worktrees.

### 1. `feat(activity): describe native agent work safely`

- `src/backend/src/activity.rs`
- `src/backend/src/cockpit.rs`
- `src/backend/src/runtime.rs`
- `src/backend/tests/fixtures/live-office-native-commands.json`
- `src/cockpit/docs/decisions/0014-native-antigravity-activity-through-rust.md`
- `src/frontend/src/bindings/ActivityOperation.ts`
- `src/frontend/src/bindings/CockpitEvent.ts`
- `src/frontend/src/bindings/RunActivity.ts`

Keeps native metadata/schema/bindings together. Existing frontend ignores the additive safe fields; no new dependency or migration.

### 2. `fix(cockpit): align idle scenes and work presentation`

- `src/cockpit/DESIGN.md`
- `src/cockpit/README.md`
- `src/cockpit/docs/architecture.md`
- `src/cockpit/docs/visual-acceptance.md`
- `src/cockpit/package.json`
- `src/cockpit/src/client/mount.js`
- `src/cockpit/src/client/scene/character-activity.js`
- `src/cockpit/src/client/scene/character-pose.js`
- `src/cockpit/src/client/scene/characters.js`
- `src/cockpit/src/client/scene/furniture.js`
- `src/cockpit/src/client/scene/office-layout.js`
- `src/cockpit/src/client/scene/office-navigation.js`
- `src/cockpit/src/client/scene/workstation.js`
- `src/cockpit/src/client/snapshot.js`
- `src/cockpit/src/client/styles/main.css`
- `src/cockpit/src/client/ui/agent-card-status.js`
- `src/cockpit/src/client/ui/ambient-dialogue.js`
- `src/cockpit/src/client/ui/bubble-coordinator.js`
- `src/cockpit/src/client/ui/hud.js`
- `src/cockpit/src/client/ui/labels.js`
- `src/cockpit/src/client/ui/office-presentation.js`
- `src/cockpit/tests/unit/agent-card-status.test.mjs`
- `src/cockpit/tests/unit/ambient-dialogue.test.mjs`
- `src/cockpit/tests/unit/bubble-arbitration.test.mjs`
- `src/cockpit/tests/unit/character-pose.test.mjs`
- `src/cockpit/tests/unit/cockpit-snapshot.test.mjs`
- `src/cockpit/tests/unit/hud-presentation.test.mjs`
- `src/cockpit/tests/unit/labels.test.mjs`
- `src/cockpit/tests/unit/office-presentation.test.mjs`
- `src/frontend/tests/live-office-command-details.mjs`
- `src/frontend/tests/live-office-completion.mjs`
- `src/frontend/tests/live-office-context.mjs`
- `src/frontend/tests/live-office-idle.mjs`
- `src/frontend/tests/live-office-presentation.mjs`
- `src/frontend/tests/live-office-work-activity.mjs`

Depends on commit 1; keeps snapshot/HUD consumers, scenes, regression tests and standalone browser entrypoint together.

### 3. `docs(office): reconcile contracts and verification`

- `ARCHITECTURE.md`
- `README.md`
- `src/VERIFICATION.md`
- `src/cockpit/docs/live-office-review.md`

Selected ignored contracts explicitly included in this documentation commit:

- `openspec/config.yaml`
- `openspec/README.md`
- `openspec/changes/align-live-office-idle-behavior/.openspec.yaml`
- `openspec/changes/align-live-office-idle-behavior/design.md`
- `openspec/changes/align-live-office-idle-behavior/proposal.md`
- `openspec/changes/align-live-office-idle-behavior/specs/live-office-ambient-dialogue/spec.md`
- `openspec/changes/align-live-office-idle-behavior/specs/live-office-idle-activity/spec.md`
- `openspec/changes/align-live-office-idle-behavior/specs/live-office-scene/spec.md`
- `openspec/changes/align-live-office-idle-behavior/tasks.md`
- `openspec/changes/align-live-office-idle-behavior/verification.md`
- `openspec/changes/describe-live-office-work-activity/.openspec.yaml`
- `openspec/changes/describe-live-office-work-activity/design.md`
- `openspec/changes/describe-live-office-work-activity/proposal.md`
- `openspec/changes/describe-live-office-work-activity/specs/live-office-work-activity/spec.md`
- `openspec/changes/describe-live-office-work-activity/tasks.md`
- `openspec/changes/describe-live-office-work-activity/verification-specific.md`
- `openspec/changes/describe-live-office-work-activity/verification.md`
- `openspec/changes/refine-live-office-presentation/.openspec.yaml`
- `openspec/changes/refine-live-office-presentation/design.md`
- `openspec/changes/refine-live-office-presentation/proposal.md`
- `openspec/changes/refine-live-office-presentation/specs/live-office-presentation/spec.md`
- `openspec/changes/refine-live-office-presentation/tasks.md`
- `openspec/changes/refine-live-office-presentation/verification.md`
- `openspec/changes/refine-live-office-presentation/verification-completion.md`

Staged-content checks passed before the local commits. GitLab issue/MR creation,
OpenSpec archive/sync, push and release remain separate actions; none is authorized
by this local commit request. Inspect `git log -3 --oneline` for the commit IDs.

## Antislop DURING delivery gate

Scope: cleanup/review only; no UI behavior, palette, motion, layout or new assets.
Existing ENERGY 2 / RHYTHM 2 / MOTION 2 and prior presentation proof remain the
visual evidence. The former outcome-bubble finding is resolved by the separately recorded
owner-approved follow-up; historical cleanup evidence remains intact.

### Hard Gate

- R-02 PASS: no new product copy or em dash introduced by cleanup.
- R-03 PASS: layout unchanged; five-width presentation proof retained and context smoke rerun.
- R-17 PASS: actual persisted run/activity counts, no generated metrics.
- R-18 PASS: no new identities or testimonials.
- R-23 PASS: no visual asset added.
- R-24 PASS: corrected documentation links point at current source entrypoints.
- R-25 PASS: no color/contrast change; prior white-bubble/text-muted evidence retained.
- R-26 PASS: no new controls; current context suite exercises real existing controls.
- R-27 PASS: empty/loading/offline states preserved; completion outcome gate verified with real success/failure/cancel cases.
- R-28 N/A: no FAQ.
- R-32 PASS: keyboard/name-tag proof retained; no control markup changed.
- R-33 PASS: only source docs and maintained test scripts cleaned; no UI overlay patch.
- R-34 N/A: no theme change.
- R-35 PASS: actual source checks/build and standalone app path run.
- R-36 PASS: no fabricated security/performance claims.
- R-37 PASS: existing DESIGN/dials and owner DURING preference retained.
- R-38 PASS: real local evidence, no seeded visual success.
- R-39 PASS: existing mobile/reduced-motion behavior preserved.
- R-40 N/A: no media or third-party script introduced.

### Purpose-Gate

- R-01 N/A: no gradient/glow change.
- R-04 N/A: no icon change.
- R-06 N/A: no typography change.
- R-07 N/A: no background change.
- R-08 N/A: no arrow change.
- R-09 N/A: no badge change in cleanup.
- R-10 N/A: no glass change.
- R-12 N/A: no shadow change.
- R-13 N/A: no glow change.
- R-14 N/A: no card layout change.
- R-19 N/A: no animation change.
- R-22 N/A: no illustration change.

### Liveliness

- Dials PASS: ENERGY 2 / RHYTHM 2 / MOTION 2 unchanged.
- Consistency PASS: existing approved studio layout retained.
- Focal point PASS: real activity name/time/action remains primary.
- Whitespace PASS: rendered spacing unchanged.
- Accent PASS: existing role colors and white bubbles retained.
- Motif PASS: consistent operational chronology retained.
- Design Read PASS: current DESIGN/architecture/checklist reviewed.

### Craftsmanship and Quality Locks

- C-1 PASS: cleanup removes stale contract/debugging noise, without decorative changes.
- C-2 PASS: no fake controls or runtime replacement introduced.
- C-3 PASS: no UI section added.
- C-4 PASS: actual context auth/offline/mobile/workspace paths checked.
- C-5 PASS: current and historical proof clearly distinguished.
- R-05 N/A: no template layout introduced.
- R-11 N/A: no radius changes.
- R-15 N/A: no new CTA.
- R-16 PASS: descriptive documentation, no marketing buzzwords.
- R-20 PASS: existing product identity retained.
- R-21 N/A: no theme toggle change.
- R-29 N/A: no palette change.
- R-30 PASS: approved reference alignment preserved, no unrelated clone.
- R-31 PASS: review decisions and remaining limits recorded above.

Comment checklist: reviewed newly added comments explain parser bounds, source
adjacency, float deadlines, anatomical axes or rigid contacts; no new decorative
banner/workflow narration. Existing unrelated comments were not rewritten. This
cleanup did not change executable production code.

Final context receipt: passed with zero page errors; public snapshot 200, anonymous
setup/mapping 401, organization entrypoint, reduced motion, filter/workspace
isolation and legacy-route remount all true. Runs/profiles stayed unchanged.

P2 follow-up final source check: 228 cockpit tests pass; the new completion harness
records real succeeded/failed/cancelled outcomes, no profile or fixture changes,
and zero browser errors. The original 226-test cleanup receipt above is historical.

## Local commit verification

The backend commit passes Rust formatting; the UI/scene commit passes the full
cockpit check (228 tests, no failures/skips, lint/format/build). No executable source
changed after the recorded real application/native outcome verification. The final
documentation commit validates all three OpenSpec changes and staged whitespace,
using exactly the 24 selected contract files. Historical empty-index statements
above describe the earlier review, before the owner authorized committing.
