# Live Office presentation audit and verification

Owner scope, 2026-11-02: remove completed badges and run navigation from activity, remove transient completed cards, replace decorative activity provenance on cards, unify/readably bound bubbles, and improve right-handed guitar geometry. Historical run outcomes remain in Riwayat. No commit, push or deploy.

## Reference and causes

Reference pinned at [kantor-agent ad92a7a](https://github.com/humaedihume/kantor-agent/blob/ad92a7a473b3d0e769281d552cee74cbb4004a54/skills/kantor-agent/runtime/public/assets/kantor.js).

- Reference renderUi (around lines 1989-2045) uses name/time/action without run links or lifecycle badges. Our additions made the passive Office feed an unnecessary route into the main product. Those routes were authenticated; this finding is unwanted navigation, not evidence of an authentication bypass. Feed now preserves observed actions and genuine failure descriptions without links, tool/status badges or buttons.
- Reference cards show task/action or waiting context. Our repeated Kegiatan visual caption described provenance instead of what an idle agent was doing. Cards now show Santai, the current scene action and Menunggu tugas baru. Successful completion returns directly to Santai; actual failure/waiting/offline facts remain explicit. Full narrative provenance remains in agent details, outside the short card line.
- Reference actionText (around lines 1824-1829) clips persistent work previews to 48 characters and hides them at widths up to 820. Our 160-character bubble plus permanent hi styling produced long green work bubbles. All surfaces/tails now use white; work/event previews use 48 graphemes, dialogue 96, with maximum three desktop/two mobile lines. Full work text remains in card title/details/feed. Unicode graphemes prevent cutting joined emoji. Mobile suppresses all non-dialogue bubbles, including transient work events; only testing kind=work initially missed this second path, found by inspecting the real screenshot and fixed in production.
- The reference guitar also uses negative X scale and a downward neck angle. Copying it was insufficient. The rig faces +Z, so anatomical left is +X; legacy left/right variable names are reversed relative to anatomy. Rotation PI+0.35 with positive scale raises the neck toward anatomical left while keeping the soundboard forward. The physically right hand strums; the physically left hand frets. The acoustic body is now a flat bevelled waist shape, with six strings, six tuners and scale-spaced frets. Radius-aware contacts and torso-following mount clear the soundboard and torso. Reduced motion holds a static guitar pose. Real scene observation additionally caught the interpolated arm rotations crossing the soundboard at arrival; guitar grips now solve exactly against the rigid prop while torso lean still blends. The regression includes 1/60-second transition steps, rather than only the default unblended unit path.
- Previous tests checked target centers without checking reflection, neck direction, hand radius or body clearance. New geometry regression checks all five actual Three.js rigs at multiple times in normal/reduced motion. No backend, persistence, permissions, profile or auth contract changed in this follow-up.

## Commands and receipts

Run from this worktree, against the owned loopback Rust service and real local SQLite/provider:

- src/cockpit: npm run check; 226 tests, zero failed/skipped; ESLint, Prettier and Vite build pass. Log: scratch/live-office-presentation/check-final.log.
- src/frontend: npm run build; TypeScript and Vite pass. Existing large-chunk advisory remains. Log: scratch/live-office-presentation/frontend-build.log.
- node src/frontend/tests/live-office-presentation.mjs: actual read-only Codex task reads three existing cart-activity files then runs npm test --prefix cart-activity. Authenticated API submission, native provider session, public Office rendering, completed-to-idle transition, passive history/reload, white preview/line bounds, mobile suppression and natural guitar observation are asserted. Three devtools observer only reads live scene geometry; no poses, API responses, timers or random choices are forced.
- src/cockpit: npm run test:e2e; standalone Office entrypoint, authentication, workspace filtering, remount, camera, reduced motion, transport loss, real pantry occupancy/dialogue and responsive checks. Receipts under scratch/live-office-presentation/context.
- openspec validate refine-live-office-presentation --strict; git diff --check.

Earlier browser attempts are retained honestly in scratch: first stopped on an incorrect test selector (.status instead of .agent-status); next found the mobile transient-event leak through visual inspection despite its narrower assertion passing. Final browser assertions cover all non-dialogue kinds. Screenshot capture now uses the actual name-tag keyboard interaction to follow the guitar character; card focus intentionally targets the agent's original desk.

## Antislop DURING delivery gate

Direction: existing approved studio DESIGN.md, ENERGY 2 / RHYTHM 2 / MOTION 2. This report supersedes prior gate claims that run links/badges were desirable. Evidence paths below refer to final receipts, not earlier failed attempts.

### Hard Gate

- R-02 PASS: new waiting/action copy has no em dash.
- R-03 PASS: real five-width browser assertions reject document overflow.
- R-17 PASS: feed and counts use persisted native events, not invented metrics.
- R-18 PASS: identities are existing real local profiles.
- R-23 PASS: guitar is source geometry; no generated asset or external media added.
- R-24 PASS: passive Office feed exposes no run/navigation controls.
- R-25 PASS: white bubbles retain dark text; timestamp retains previously measured text-muted contrast (at least 4.92:1).
- R-26 PASS: existing tabs, camera and name-tag keyboard activation retain actual behavior.
- R-27 PASS: failure/offline/waiting remain explicit; regression tests preserve them.
- R-28 N/A: no FAQ.
- R-32 PASS: native camera/tabs and existing keyboard name-tag interaction are exercised; no dead feed links remain.
- R-33 PASS: changes are production source modules/CSS, no runtime patch overlay.
- R-34 N/A: no theme toggle.
- R-35 PASS: source frontend built and real API/provider/browser exercised.
- R-36 PASS: no marketing/security/performance claims introduced.
- R-37 PASS: owner approved scope and DURING mode; existing DESIGN provides direction.
- R-38 PASS: screenshots contain observed local tasks/activities; no seeded visual success.
- R-39 PASS: mobile work stays in cards; existing focus/reduced-motion controls retained.
- R-40 N/A: no media, third-party script or hero asset added.

### Purpose-Gate

- R-01 N/A: no gradient or glow added.
- R-04 N/A: no icon added.
- R-06 PASS: existing compact timestamps and typography retained for scanning.
- R-07 N/A: no decorative background.
- R-08 N/A: no decorative arrow.
- R-09 PASS: unnecessary feed/status/tool badges removed by owner instruction; genuine operational status remains on cards.
- R-10 N/A: no glass surface added.
- R-12 N/A: no shadow added.
- R-13 N/A: no glow added.
- R-14 PASS: existing cards communicate actual operational/scene state, no feature grid introduced.
- R-19 PASS: scene animation respects reduced motion; no feed animation added.
- R-22 PASS: guitar shape, strings and orientation directly describe the requested scene activity.

### Liveliness

- Dials PASS: ENERGY 2 / RHYTHM 2 / MOTION 2 retained.
- Consistency PASS: restrained activity list and animated studio retain one hierarchy.
- Focal point PASS: name/time/action lead; redundant badge/link/provenance text removed.
- Whitespace PASS: existing row spacing retained; bubbles have explicit text/line bounds.
- Accent PASS: role identity retains its color; all bubble surfaces share white.
- Motif PASS: chronological name/time/action repeats consistently.
- Design Read PASS: existing cockpit design, architecture and visual checklist informed changes.

### Craftsmanship and Quality Locks

- C-1 PASS: each change serves passive navigation, readable text or physical guitar contact.
- C-2 PASS: real tabs/name-tag/camera paths exercised; no placeholder controls.
- C-3 PASS: no new UI section or parallel activity system.
- C-4 PASS: viewport, reload, auth, workspace, reduced-motion and transport checks use actual app wiring.
- C-5 PASS: native provider execution and persisted history provide real proof.
- R-05 PASS: existing product composition retained.
- R-11 PASS: no radius changes or new pills.
- R-15 PASS: Menunggu tugas baru describes the current idle state plainly.
- R-16 PASS: visible work descriptions retain actual command/file meaning.
- R-20 PASS: studio identity and role palette retained.
- R-21 PASS: no theme direction change.
- R-29 PASS: existing palette tokens retained, uniform bubble surface.
- R-30 PASS: reference behavior adapted to explicit owner choices and actual rig anatomy.
- R-31 PASS: decisions and reference differences are recorded above.

## Limits

Guitar proof covers stylized geometry/contact at sampled animation phases and five rigs; it is not a finger-level instrument simulation. Live provider proof is Codex on this loopback fixture, not a production deployment or new AGY/OpenCode execution. Backend was not changed or rebuilt in this follow-up. Existing unrelated dirty work remains untouched. All integration runs use real app APIs; no API/auth/provider/scene mocks.

## Final real presentation receipt

- Real run `a7830b0e-bf05-4962-84fd-4fb6ca5fcd15`: succeeded, exit 0, native session `01a19c3d-f8a7-71e3-bd5c-0a2b494cd9b5`. Persisted native command output confirms three-file Get-Content and npm test: 1 test, 1 pass, 0 fail (provider-commands.json).
- browser-final/presentation-proof.json: passed, zero page errors, widths 320/390/768/1024/1440, history survives reload, no feed links or badges. Work preview 48 graphemes / two actual desktop lines, white surface and tail; mobile shows no non-dialogue work bubble while agent is working.
- The successful work/mobile observation was reused read-only when resuming the remaining guitar/viewport checks after test-selector corrections. The only subsequent production edit was guitar grip interpolation; final guitar and viewport captures use the rebuilt source with that fix. No provider task was fabricated or replayed into the UI.
- Naturally playing Nova: positive transform determinant 1.000000, neck delta X/Y 0.6106/0.2227, forward dot 0.999982, picking palm clearance 0.0140, torso clearance 0.0390 scene units. Six strings/six tuners.
- Visually inspected final work desktop/mobile, guitar focused/orbit and all five width captures. Guitar-focused shows the right hand over the soundboard and left hand on the raised neck, without a mirrored face. Normal card click retains original desk focus; actual name-tag Enter follows the character.

## Follow-up file scope

Production: cockpit src/client/{mount.js,snapshot.js,styles/main.css}, ui/{hud.js,agent-card-status.js,labels.js,office-presentation.js,bubble-coordinator.js}, scene/{characters.js,character-pose.js}. Regressions: corresponding cockpit unit suites including bubble-arbitration, frontend/tests/{live-office-presentation,live-office-context,live-office-work-activity,live-office-command-details}.mjs. Documentation: cockpit README/DESIGN/architecture/visual-acceptance, src/VERIFICATION.md and this OpenSpec change. Existing earlier backend/layout/dialogue work remains uncommitted and was not rewritten by this follow-up.

- Final standalone context suite: passed, zero page errors; public snapshot 200, anonymous setup/mapping 401; organization entrypoint, camera/desks, real two-user pantry observation, reduced motion, offline recovery, filter/workspace isolation and legacy remount passed. Provider runs/profiles unchanged by this suite. All six context screenshots inspected. Browser network-offline and reduced-motion preferences deliberately inject those conditions; no fake API/auth/provider/scene.

## Cleanup review

The temporary AE_TEST_RESUME branch used during the earlier interactive verification
was removed in the subsequent diff review. Historical receipts above still describe
what actually ran; the maintained presentation suite now always starts a fresh
provider run. See [review and commit plan](../../../src/cockpit/docs/live-office-review.md) for current cleanup checks and remaining findings.
