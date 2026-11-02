# Verification — align-live-office-idle-behavior

Date: 2026-11-02. Base revision: `6f6947c7271a6ad6ae15ccb41d376509aca77511`.
No commit, push, deployment, production access, or archive was performed.

## Candidate and commands

The isolated native Rust candidate listens only on `127.0.0.1:18795`, uses its own
SQLite organization/workdir, and serves this worktree's built React frontend.
The backend and worker were rebuilt from this worktree with `cargo build --locked`
(exit 0, 30m 55s). The source-built candidate passed the standalone E2E suite;
backend source was not changed. The registered Windows worker uses the real Codex
CLI and advertised catalog. Credentials remain private.

- `npm run check --workspace cockpit`: exit 0, 221 tests passed, zero failed/skipped.
- `npm run lint --workspace frontend`: exit 0, three existing warnings.
- `npm run build --workspace frontend`: exit 0; existing large-chunk warning.
- `npm run test:e2e --workspace cockpit`: exit 0 against the final candidate.
- `cargo build --locked --manifest-path Cargo.toml`: exit 0; native backend rebuilt.
- `node scratch/live-office-idle/analyze-dialogue.mjs context-source/context-proof.json`: exit 0.
- `node scratch/live-office-idle/verify-interruption.mjs`: exit 0.
- `AE_TEST_RUN_INTERRUPTION=true node frontend/tests/live-office-idle.mjs`: exit 0 on the source-built backend/worker; provider succeeded.
- `git diff --check`: exit 0.
- `openspec validate align-live-office-idle-behavior --strict`: valid.

Logs and source/bundle hashes are in the local ignored
[build receipt](../../../scratch/live-office-idle/build-receipt.json).
The receipt distinguishes the base revision from the uncommitted source hashes.

## Acceptance evidence

| Area | Observed evidence |
| --- | --- |
| Activity/card/detail/feed | Natural roaming trace covers TV, PS, coffee, water, reading, guitar, window, meeting and walking. Final browser compares focused card/detail text; failure hints remain visible. Visual feed reached 100 entries without increasing work counters. |
| Feed lifecycle | Final real browser passes reload/remount, empty group filter and separate workspace isolation, offline/recovery and reduced motion. Profile/run records remain equal before and after observation. No storage or API is used for the visual buffer. |
| Guitar | Five profiles each captured in main/front/side views. Actual scene contact samples and all-profile rig regressions cover multiple strum phases and walking visibility. Guitar geometry stayed unchanged during the later keyboard/plant clearance correction. |
| Four desks | Final browser verifies actual GLB keyboard/mouse bottoms within 1 mm of the actual desktop top, and saves four desk camera close-ups. Shared desk mat and material are removed. |
| Pantry | Final world anchors: counter (8.2, 0.012, -6.45), pot (6.6, 0.012, -6.4). Bounds clear inside walls, cabinet/pot and dispenser. Plant scale 0.8 preserves its anchor while clearing foliage. |
| Navigation | 250 real scene samples include two coffee occupants at (8.25, 0.012, -5.45) and (7.5, 0.012, -5.45), approaching/arriving/leaving pantry transitions, plus the controller's real geometry/path regressions. |
| Dialogue | 12 observed openers on the source-built candidate; nine completed conversations meet all three duration targets within 250 ms. Other observations are retained in the raw timeline rather than omitted. Five example opener/reply-delay/reply-duration triples in ms: 4799.2/2319.6/4179.7, 4800.0/2299.7/4220.2, 4819.6/2299.9/4220.1, 4811.2/2284.2/4232.9, 4828.1/2319.9/4199.7. Deterministic clock/random regressions cover exact deadlines, retry, stall, peer selection and lifecycle. |
| Real work interruption | Source-built run `f185bdaf-6330-45f7-be46-7f20a3045f4f` progressed starting → running → succeeded, exit 0, with a real provider session. Browser showed working, replaced the opener after 1376.6 ms and emitted no pending reply. The provider returned the fixture's actual first line and two nonempty lines. |

Evidence files:

- [Final standalone browser receipt](../../../scratch/live-office-idle/context-source/context-proof.json)
- [Final desktop view](../../../scratch/live-office-idle/context-source/office-final.png)
- [Final mobile view](../../../scratch/live-office-idle/context-source/office-final-mobile.png)
- [Nova desk close-up](../../../scratch/live-office-idle/context-source/desk-data_engineer.png)
- [Five-profile guitar and activity receipt](../../../scratch/live-office-idle/browser-final/idle-proof.json)
- [Nova guitar front](../../../scratch/live-office-idle/browser-final/guitar-data_engineer-front.png)
- [Atlas guitar side](../../../scratch/live-office-idle/browser-final/guitar-data_scientist-side.png)
- [Lyra guitar side](../../../scratch/live-office-idle/browser-final/guitar-research_scientist-side.png)
- [Orion guitar front](../../../scratch/live-office-idle/browser-final/guitar-hq_lab_director-front.png)
- [Axiom guitar front](../../../scratch/live-office-idle/browser-final/guitar-ml_engineer-front.png)
- [Dialogue timeline](../../../scratch/live-office-idle/dialogue-proof.json)
- [Navigation samples](../../../scratch/live-office-idle/navigation-proof.json)
- [Interruption assertions](../../../scratch/live-office-idle/interruption-proof.json)
- [Real working UI](../../../scratch/live-office-idle/browser-final/real-run-working.png)
- [Source-built real run receipt](../../../scratch/live-office-idle/browser-source/idle-proof.json)
- [Verified source-built provider result](../../../scratch/live-office-idle/provider-source-proof.json)
- [Source-built working UI](../../../scratch/live-office-idle/browser-source/real-run-working.png)
- [Source-built completed UI](../../../scratch/live-office-idle/browser-source/real-run-completed.png)

## Limits and owner-approved adjustment

The owner approved standalone acceptance on 2026-11-02 because both office routes
already use StandaloneOffice. `test:e2e` now exercises that real path; the old suite
is preserved under `test:e2e:legacy`. Its failed overlay expectation remains in
`scratch/live-office-idle/e2e.log`; no overlay/focus-trap pass is claimed.

The initial combined observation command exited 1 because it additionally demanded
provider success. Its raw receipt is preserved. The accepted interruption task does
not require a successful provider result: separate assertions verify the actual
working transition and reply cancellation. That initial provider execution ended with
"Remote connection ended without completion confirmation" and exit 1; no successful
fixture-read result is claimed. The platform's automatic failure-review child later
succeeded. Neither result was mocked or rewritten as success. After rebuilding the
backend and worker from this worktree, a separate acceptance run succeeded with
exit 0, verified fixture output, and pending-reply cancellation. The interrupted
result remains historical evidence; the final source-built provider check passed.

Browser results describe the local candidate and normal visible rendering, not
production, every GPU, or every machine's scheduling. OpenSpec and proof artifacts
remain ignored/local under the repository's existing policy.
