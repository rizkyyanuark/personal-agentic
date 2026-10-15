# DEP-002 tasks

Historical task record for DEP-002. The source/contract drain policy was superseded by [CI-003](../2026-10-14-CI-003-simple-automatic-releases/proposal.md). The checks below preserve their original scope and do not form the current implementation queue; current phase and release evidence are tracked separately.


- [x] DEP2-T1 / R1–R5: audit actual admission, helper, UI and bootstrap paths; record accepted 15-minute policy and create Issue #4/branch. Owner: coordinator.
- [x] DEP2-T2 / R1–R3: implement shared durable gate, authenticated global protocol, typed errors, public state, all admission/continuation paths and physical store/router checks. Owner: backend implementer; predecessor T1.
- [x] DEP2-T3 / R4: integrate root helper ownership/wait/seal/resume/recovery and image compatibility; physical HTTP/failure contracts. Owner: release implementer; predecessor T1 and agreed T2 protocol.
- [x] DEP2-T4 / R5: wire existing UI notice and work controls, preserve drafts/answers/history/Stop; generated bindings and browser proof. Owner: UI implementer; predecessor stable T2 interface and required antislop mode choice.
- [x] DEP2-T5 / R1–R5: exercise isolated real app/API/terminal/queue/provider as relevant, restart persistence and helper boundary proofs; independent review and relevant full checks after final edit. Owner: coordinator/verifier; predecessors T2–T4. Final155 Rust tests and three-turn corrected native chat acceptance passed; initial collector failure preserved.
- [x] DEP2-T6 / R4/R5: update runbook, image marker, CI bounded manual gate, finalize DEP-001 installation evidence in its historical contract, capture proof and publish Draft MR with latest CI. Owner: coordinator; predecessors T2–T5. MR !5 and source commit d7645de accepted by all five pipeline53 jobs; documentation-only closure is checked again by the MR pipeline.
- [ ] DEP2-T7 / R5: owner review/merge and first production bootstrap, installed helper and production proof. Pending review of concrete result; predecessor T6. Not authorized by the implementation continuation.

Automatic routine deployment remains a later change after installed drain acceptance.
