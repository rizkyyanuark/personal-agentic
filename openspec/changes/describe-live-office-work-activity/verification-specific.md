# Specific command metadata follow-up

## Audit

Both vague entries had sufficient real source metadata. This was a parser gap:
- Event 84: recorded pwsh Get-Content -LiteralPath src/cart.js, package.json.
  The old parser treated src/cart.js, as one filename; later path sanitization
  omitted it. The second filename was lost.
- Event 113: recorded pwsh node --input-type=module --eval with quoted JavaScript.
  The outer escaped quotes caused the old single-command lexer to reject the frame.
  Inline JavaScript evaluation also needed an explicit operation label.

PowerShell LiteralPath is a path array, confirmed by the official documentation:
https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/get-content?view=powershell-7.5#-literalpath
The regression fixture contains these two exact real command frames, with output
omitted: backend/tests/fixtures/live-office-native-commands.json.

## Changes

- Decode supported recorded shell wrappers before tokenizing the actual command.
- Parse comma-separated Get-Content targets with quote awareness. Support relative
  ./ paths; bound targets to eight, sanitize each and preserve relative_file for
  older clients. Optional relative_files carries multiple safe names.
- Identify Node.js --eval/--print explicitly; publish a closed purpose label,
  never raw JavaScript, private output or arbitrary command arguments.
- Enrich missing legacy details from only the immediate next same-run event when
  it is a matching native command output. SQLite returns command metadata only.
  Do not jump across unrelated events or rewrite persisted rows.
- Use the same file-list labels on the active card and history panel.

## Verified results

Old public event 84 now reads: Membaca src/cart.js, package.json.
Old public event 113 now reads: Menjalankan: Evaluasi JavaScript dengan Node.js.
Their event IDs, step identities, timestamps and states match the previous receipt.
The original SQLite payloads also exactly match that earlier receipt, including
its old malformed src/cart.js, filename and null command operation: no historical rewrite.
Proof: scratch/live-office-work-activity/specific-stored-history.json.

One new real read-only run executed both native forms:
- Run: 360e84be-6b7c-4455-8578-3c58269e3828.
- Native Codex session: 01a19c3d-f8a7-71e3-bd5c-0a2b494cd9b5.
- Status succeeded; exit 0; actual Node.js stdout was 36.
- Two real steps, with both file names and the explicit Node.js evaluation label.
- All agent profiles remain identical; no permission or workdir changes.
- Real browser working state, reload, run/session navigation and keyboard focus
  across 4.5 seconds of polling passed.
- 320/390/768/1024/1440 widths passed without document overflow or page errors.
- The real public snapshot has 11 work entries, zero bare Membaca entries,
  zero Perintah selesai entries and zero active runs.

Real dependencies: source-built Rust backend, SQLite, registered local worker,
native Codex CLI, PowerShell/Node.js, actual React/Three.js app and Edge browser.
No mock API, fake provider, fabricated native frame or hardcoded UI response was
used for this smoke. Recorded native fixtures support parser/privacy regressions;
they do not substitute for the actual run above.

Commands:
- cargo test --locked: 168 passed, 0 failed, 0 ignored.
- cargo build --locked: PASS, 3m01s.
- npm run check (cockpit): 223 passed; lint/format/build PASS.
- npm run lint and npm run build (frontend): exit 0; three pre-existing lint
  warnings and the existing bundle-size warning remain.
- cargo fmt --manifest-path src/Cargo.toml --all --check: PASS.
- openspec validate describe-live-office-work-activity --strict: PASS.
- node frontend/tests/live-office-command-details.mjs: PASS, real run and history.
- npm run test:e2e (standalone office): PASS; actual entrypoint/camera/pantry,
  reduced motion, offline recovery, workspace/filter isolation, remount and mobile
  assertions passed with zero page errors.

Current executable SHA256:
DA6BBB76F319E3EED20884D468D37D03FA71F49711FDEA3400A91A069B6C5318.
Logs/JSON/screenshots: scratch/live-office-work-activity/specific-*.log,
specific-stored-history.json, specific-final-public.json and specific-browser/.
Screenshots inspected: historical-details.png and command-details-320/390/768/1024/1440.png.

Files changed in this follow-up: backend/src/activity.rs, backend/src/cockpit.rs,
backend/tests/fixtures/live-office-native-commands.json; cockpit snapshot.js and
cockpit-snapshot.test.mjs; generated ActivityOperation/RunActivity bindings;
frontend/tests/live-office-command-details.mjs; src/VERIFICATION.md, cockpit
architecture and this existing OpenSpec change's design/spec/tasks/verification.
No migration, added dependency, auth change, queue change, commit, push or deploy.

## Limits

Unrecognized shell programs or absent/unmatched native sources remain honest
fallbacks; their meaning is never fabricated. Sensitive paths remain omitted.
The live provider smoke is Codex; AGY/OpenCode use the shared parser and existing
native-format contract tests. Local C: disk remains constrained; only reproducible
compiler executable/symbol artifacts were removed to complete verification.

## Antislop DURING delivery gate

Scope: changed activity feed, its card boundary, and new run navigation. Existing
product identity and scene design remain the design read. ENERGY 2 / RHYTHM 2 /
MOTION 2. Focus is the activity text; spacing separates steps; role color identifies
real agents. No new decorations, media assets or theme were introduced.

### Hard Gate

- R-02 PASS: new operation labels, timestamps and Lihat run contain no em dashes.
- R-03 PASS: specific-browser/command-details-proof.json records zero document overflow at all five widths.
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
  reduced-motion and mobile feed behavior passed specific native/browser checks.
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



## Gate scope update

All four gate blocks above apply to this follow-up. No controls, style, typography,
media or motion were introduced. New text uses existing accessible feed styles.
Both new labels are backed by the actual native commands and execution proof;
all five width screenshots were inspected for the longer labels and file lists.
