# DEP-001 tasks

- [x] DEP-T1 / R1–R5: inspect source and real failed deployment, accept scope and phased automation decision; create Issue3 and branch from released main.
- [x] DEP-T2 / R1: implement bounded transport readiness in the existing request/smoke path. Owner: coordinator, `release.py`; predecessor T1.
- [x] DEP-T3 / R2–R4: implement explicit identity/state/backup gates and replayable journal finalization. Owner: coordinator, `release.py`; predecessor T1, followed by shared-file review.
- [x] DEP-T4 / R1–R4: verify transport, request parsing, physical backup and journal contracts with focused tests. Owner: test implementer, `infra/production/tests`; predecessor stable T2/T3 interfaces.
- [x] DEP-T5 / R5: exercise real application readiness and idempotent candidate CLI, inspect diff and independent review; capture sanitized proof. Owner: coordinator/verifier; predecessors T2–T4.
- [x] DEP-T6 / R5: update runbook and existing CI job, record proof and prepare Draft MR with latest CI. Owner: coordinator; predecessors T4/T5. MR4 published, implementation pipeline49 passed; latest MR head remains the merge gate.
- [x] DEP-T7 / R5: reviewed merge and administrator installation of exact helper; verify actual installed behavior. Owner approved on 12 October 2026; MR4 merged as `18f4dfb`, SHA256 `3fdb452259f2b86fb194c35a5992c5dc3125d4e9677f35cbd4d0359ea97ffdf5` installed root:root/0755 with verified private backup. Actual installed recover returned unchanged and rejected a wrong digest; no app/container/business-state change. [Issue3](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/3) retains the durable installation evidence. Predecessor T6; no new image release was needed to replace this host helper.

Automatic routine deployment requires a subsequent accepted change for admission/drain and policy gates; it is not marked implemented by these tasks.

T6 runbook/CI wiring, owner-approved capacity expansion, post-growth production smoke and full implementation CI passed. T7 was accepted after the administrator installation; this checklist update records that later event without changing the historical source/CI identities. Evidence-only updates must pass their latest MR pipeline before merge.
