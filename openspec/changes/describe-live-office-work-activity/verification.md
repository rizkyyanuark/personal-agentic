# Live Office work activity verification

Latest owner follow-up: see [specific command metadata verification](verification-specific.md).

## Outcome and cause

Owner correction: leisure stays on cards/details; the left panel retains actual
work history after completion/reload. No commit, push, deploy or archive.

The main cause was logic, rather than merely a simple test assignment. The old
runtime adapter normalized Antigravity only. The audited local SQLite database
contained Codex command frames but zero persisted run.activity rows. The public
projection also emitted generic run.changed and responding lifecycle messages;
the frontend removed run/step context and displayed time without seconds.

The reference parser uses actual tool metadata, filenames and Bash descriptions:
https://github.com/humaedihume/kantor-agent/blob/ad92a7a473b3d0e769281d552cee74cbb4004a54/skills/kantor-agent/runtime/lib/node/transcripts.mjs
This implementation uses a closed operation enum and safe relative paths; private
assistant text, arbitrary descriptions, raw command arguments and output are not
published. Detailed provider evidence remains in the authenticated run inspector.

## Implemented behavior

- Antigravity/Codex/OpenCode tool events normalize into persisted RunActivity.
- Safe file read/search/write/edit and common build/test/git/lint/type operations.
- Sensitive, outside-workspace and ambiguous shell targets stay omitted. Unknown
  commands keep honest generic labels and a real run link.
- Native item identity coalesces active/completed/failed updates into one step.
- Current activity covers all working runs independently of bounded history.
- The panel retains 100 actual work steps/events, HH:mm:ss and Lihat run links.
- Leisure appears only on cards/details. Generic run-change/response noise is omitted.
- Focus survives idle updates and polling; links have a visible outline and 44px target.
- Timestamp contrast uses the existing text-muted token for legibility.

## Real receipts

Checkout: C:/Users/rizky/.codex/worktrees/3e0b/personal-agentic, detached base
6f6947c7271a6ad6ae15ccb41d376509aca77511. Prior six-point changes were preserved.
Candidate: http://127.0.0.1:18795/office, source-built Rust/React/Three.js, real
SQLite and registered local worker. Other installed workers/services were untouched.
Final executable SHA256: D47E55B8C5FAA26A0516884E30BBCD5155021B7DB0609C2A95C41EFFC4B65BA4.

- cargo test --locked: 165 passed, 0 failed, 0 ignored (backend-tests-final.log).
- cargo build --locked: PASS, final build 1m36s (backend-build-final.log).
- cargo fmt --manifest-path src/Cargo.toml --all --check: PASS.
- npm run check in src/cockpit: 222 passed, lint/format/library build PASS.
- npm run lint in src/frontend: exit 0; three pre-existing warnings remain.
- npm run build in src/frontend: PASS; existing large-bundle warning remains.
- openspec validate describe-live-office-work-activity --strict: PASS.
- node frontend/tests/live-office-work-activity.mjs: PASS with real Codex.
- node scratch/live-office-work-activity/final-history.mjs: PASS on final source.
- npm run test:e2e in src/cockpit: PASS (context/context-proof.json).
  Actual popup entrypoint, four desk camera views, simultaneous pantry occupants,
  reduced motion, offline recovery, group/workspace isolation, mobile and remount passed;
  visual feed count 0, no page errors.

Real task repaired a cart total in a disposable child workdir. Run
52477cf1-235f-426e-9311-0925d23275c1 succeeded, exit 0; native session
01a19bf5-3515-7ce0-bd39-8485772aa559. Public receipt: nine distinct steps, including
read_file, search_files, edit_file, build and test. The original agent profile was
restored through the real API. Independent fixture npm run build/npm test passed
and the actual file now sums item.price * item.quantity.

Final browser receipt proves history after idle/reload, no leisure entries,
HH:mm:ss, real run/session navigation, anonymous private-events HTTP 401, five
widths (320,390,768,1024,1440), no horizontal overflow and no page errors. Keyboard
focus remained after 4.5 seconds across polling; target height 58.78px, solid outline.
Screenshots and JSON receipts: scratch/live-office-work-activity/.

The provider smoke used the preceding source candidate; final path hardening was
then covered by the full 165 tests and final-source persisted API/browser replay.
No native actions were fabricated or backfilled. Native OpenCode/Antigravity are
covered by format/lifecycle/privacy fixtures, not live provider smoke in this session.

Initial failed checks are retained: sandbox EACCES resolved by real loopback access;
a parallel-run projection regression was fixed; compiler disk/PDB errors resolved
by deleting reproducible local caches/symbols and rebuilding. Initial E2E observation
missed simultaneous pantry occupancy; the next run hit popup navigation waiting
under parallel browser load. The runner now waits explicitly for popup URL/canvas
and allows up to five minutes for actual pantry coexistence. Assertions remain.

## Changed files in this follow-up

Backend: src/backend/src/activity.rs, runtime.rs, cockpit.rs.
UI: src/cockpit/src/client/snapshot.js, ui/hud.js, ui/office-presentation.js,
styles/main.css. Bindings: ActivityOperation.ts, RunActivity.ts, CockpitEvent.ts.
Tests: cockpit-snapshot.test.mjs, office-presentation.test.mjs;
frontend/tests/live-office-work-activity.mjs, live-office-context.mjs, live-office-idle.mjs.
Docs: src/VERIFICATION.md, cockpit README/architecture/visual-acceptance and ADR0014.
OpenSpec: this follow-up's proposal/design/spec/tasks and a supersession note in
align-live-office-idle-behavior. No table migration or dependency was added.

## Antislop DURING delivery gate

Scope: changed activity feed, its card boundary, and new run navigation. Existing
product identity and scene design remain the design read. ENERGY 2 / RHYTHM 2 /
MOTION 2. Focus is the activity text; spacing separates steps; role color identifies
real agents. No new decorations, media assets or theme were introduced.

### Hard Gate

- R-02 PASS: new operation labels, timestamps and Lihat run contain no em dashes.
- R-03 PASS: final-history-proof.json records zero document overflow at all five widths.
- R-17 PASS: counts/steps come from real SQLite/API, not hardcoded display metrics.
- R-18 PASS: no testimonials or invented people; identities come from existing profiles.
- R-23 PASS: no new visual assets; source-backed run navigation implements owner scope.
- R-24 PASS: keyboard Lihat run opens the existing group runs route and actual native session.
- R-25 PASS: timestamp #57524b contrast 6.20 to 7.22 on sampled final panel pixels,
  and 4.92 against conservative #cfcecb; new link #2b2a28 measured above 11:1.
- R-26 PASS: new native anchors navigate; existing tabs exercised by real browser suite.
- R-27 PASS: existing empty/loading/disconnected copy remains; failure states are explicit.
- R-28 N/A: this flow has no FAQ.
- R-32 PASS: keyboard focus outline and Enter navigation pass after 4.5 seconds of polling.
- R-33 PASS: changes are in production Rust/JS/CSS sources; no runtime UI patch overlay.
- R-34 N/A: no theme toggle introduced; existing warm studio theme preserved.
- R-35 PASS: native backend/frontend built and actual provider/API/browser path exercised.
- R-36 PASS: no security/compliance/performance marketing claims added.
- R-37 PASS: owner confirmed scope and DURING; existing DESIGN.md provided direction/dials.
- R-38 PASS: screenshot content comes from an explicitly named real local acceptance run.
- R-39 PASS: links are native, named, cursor pointer, 58.78px target and visible focus;
  reduced-motion and mobile feed behavior passed final browser checks.
- R-40 N/A: no media, third-party script, hero asset or performance claim introduced.

### Purpose-Gate

- R-01 N/A: no gradients or glow added.
- R-04 N/A: no icons added.
- R-06 PASS: existing compact mono timestamps aid scanning; no display font added.
- R-07 N/A: no decorative background added.
- R-08 N/A: Lihat run uses plain text, no decorative arrows.
- R-09 PASS: existing badges now show actual step state, with explicit lifecycle purpose.
- R-10 N/A: no glassmorphism surface added.
- R-12 N/A: no shadow added.
- R-13 N/A: no glow added.
- R-14 N/A: no feature cards added; existing list expresses chronological work.
- R-19 PASS: no feed animation; existing scene and reduced-motion gates remain.
- R-22 N/A: no illustration added.

### Liveliness

- Dials PASS: existing approved ENERGY 2 / RHYTHM 2 / MOTION 2 retained.
- Consistency PASS: restrained list within the existing animated office; no competing motion.
- Focal point PASS: action/path is the readable content, followed by real state and run link.
- Whitespace PASS: existing row spacing separates chronological entries and link hit areas.
- Accent PASS: existing role colors identify agents; no extra palette or decoration.
- Motif PASS: consistent name/time/action/state/run pattern repeats for actual work steps.
- Design Read PASS: cockpit DESIGN.md/architecture/visual checklist read before UI work.

### Craftsmanship and Quality Locks

- C-1 PASS: each change has a purpose: action labels for clarity, seconds for sequence,
  run links for traceability, caching/restoration for focus, muted token for contrast.
- C-2 PASS: real anchor navigation, mobile activity tab and keyboard path exercised.
- C-3 PASS: no new section; existing activity list serves actual chronological work.
- C-4 PASS: five widths, reload, polling focus, reduced motion and auth checks pass.
- C-5 PASS: evidence is the real native run and persisted events; no fake success.
- R-05 PASS: existing product layout retained; no template sections introduced.
- R-11 PASS: no radius changes or extra pills introduced.
- R-15 PASS: specific Lihat run label opens run details.
- R-16 PASS: operation labels describe observed work, without marketing buzzwords.
- R-20 PASS: existing warm studio scene and role identity retained.
- R-21 PASS: existing theme direction preserved; no theme toggle deferred by this change.
- R-29 PASS: existing palette tokens retained; timestamp reuses text-muted.
- R-30 PASS: user-requested reference behavior, with existing application visual identity.
- R-31 PASS: all major UI decisions and reasons are recorded above.

## Remaining limits

Complex shell programs and unavailable native metadata retain generic labels.
Sensitive or ambiguous targets are omitted, including PowerShell comma lists.
Historical events without detailed metadata cannot be made descriptive retroactively.
OpenCode/Antigravity still need native provider smoke in a suitably configured local runtime.
Local disk remains tight; compiler errors were not treated as test successes.


Final handoff: OpenSpec apply reports all_done, 4/4 tasks complete; strict validation
and final diff/format checks pass. The candidate returns HTTP 200, has nine actual
work events and zero active runs. Nova's original read-only profile is restored.
Inspected final-feed screenshots at all five widths and all four desk screenshots;
the current in-app browser tab was reloaded and left on Aktivitas.
