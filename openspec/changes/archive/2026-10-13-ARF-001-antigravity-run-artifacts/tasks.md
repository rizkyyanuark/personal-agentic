# ARF-001 tasks

Overall priority and phase belong to [issue #1](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/1). This checklist records individual acceptance, rather than copying pipeline or deployment status.

| Task | Depends on | Acceptance and evidence |
| --- | --- | --- |
| ARF-T1: inspect old document failure and upstream contracts | None | Recorded run/session and workdir boundary identified; pinned precedents in `src/UPSTREAM.md`. |
| ARF-T2: capture and persistence | T1 and accepted R1-R3/R7 | Existing Artifact storage, bounded native-session source read, completion-before-publication and historical recovery; Rust and Linux transport checks. |
| ARF-T3: preview and explicit export | T2 | Real desktop/mobile recovery, offline saved preview, byte-preserving UI/API export, failure paths and manual Knowledge separation. |
| ARF-T4: independent authorization review and remediation | T2/T3 | Bootstrap-owner filesystem guard applied at the router and module boundaries; final locked Rust run passed 142 tests, including real invited-owner HTTP and non-default workspace regressions. |
| ARF-T5: publication | T4 and local proof | Commit includes source/new files, push targets canonical GitLab, Draft MR links this issue and reports limits. |
| ARF-T6: review and release eligibility | T5 | Latest MR CI and review pass, followed by a reviewed protected-main image and its smoke checks. |
| ARF-T7: production acceptance | T6 and operator authorization | Consistent backup, selected immutable digest, real production document flow and release evidence. |

Local implementation and product evidence for T1-T3 were obtained before this contract was written. T4 was verified after review. T5-T7 require their own publication, review and deployment evidence; an accepted design or existing local image does not prove them.
