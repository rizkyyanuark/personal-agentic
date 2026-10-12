# DEP-001 tasks

- [x] DEP-T1 / R1–R5: inspect source and real failed deployment, accept scope and phased automation decision; create Issue3 and branch from released main.
- [x] DEP-T2 / R1: implement bounded transport readiness in the existing request/smoke path. Owner: coordinator, `release.py`; predecessor T1.
- [x] DEP-T3 / R2–R4: implement explicit identity/state/backup gates and replayable journal finalization. Owner: coordinator, `release.py`; predecessor T1, followed by shared-file review.
- [x] DEP-T4 / R1–R4: verify transport, request parsing, physical backup and journal contracts with focused tests. Owner: test implementer, `infra/production/tests`; predecessor stable T2/T3 interfaces.
- [x] DEP-T5 / R5: exercise real application readiness and idempotent candidate CLI, inspect diff and independent review; capture sanitized proof. Owner: coordinator/verifier; predecessors T2–T4.
- [x] DEP-T6 / R5: update runbook and existing CI job, record proof and prepare Draft MR with latest CI. Owner: coordinator; predecessors T4/T5. MR4 published, implementation pipeline49 passed; latest MR head remains the merge gate.
- [ ] DEP-T7 / R5: reviewed merge and administrator installation of exact helper; verify actual installed behavior. Pending final owner decision; predecessor T6. No image release is required merely to replace this host helper.

Automatic routine deployment requires a subsequent accepted change for admission/drain and policy gates; it is not marked implemented by these tasks.

T6 runbook/CI wiring, owner-approved capacity expansion, post-growth production smoke and full implementation CI passed. T7 remains pending the owner's review/decision. Evidence-only updates must pass their latest MR pipeline before merge.
