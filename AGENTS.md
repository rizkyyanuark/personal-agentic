# AGENTS.md

## Shared development and release policy

Read [CONTRIBUTING.md](CONTRIBUTING.md), [docs/development.md](docs/development.md)
and, for releases, [docs/deployment.md](docs/deployment.md). These versioned
documents are the shared reference across agents and chats. Recheck the current
checkout, source and GitLab state; earlier chat reports are dated evidence.
Explicit task instructions control the authorized scope. Do not change CI,
project settings or a different MR as incidental cleanup.

- After scope and implementation are approved, complete local coding, relevant
  verification and diff review without asking about each routine step. Create a
  work branch from current GitLab main before coding. Preserve dirty work; a
  separate worktree is an option, not a requirement.
- Prepare a concrete reviewed diff, then obtain publication permission for
  commit/push/MR together. Permission for only a subset remains limited to that
  subset. Never commit as incidental housekeeping.
- After publication is authorized, monitor CI to completion and fix failures
  within scope, including corrective commits/pushes. Do not weaken checks. Ask
  before expanding scope or changing infrastructure. Report external blockers
  rather than retrying indefinitely. Explicit stop instructions still apply.
- Create an MR Ready after local implementation, tests and review are complete.
  Draft is for unfinished work, unresolved scope or an explicit request. Ready
  does not authorize merge. Keep auto-merge off unless explicitly approved.
- Merge requires separate explicit owner permission. With current CI, that also
  authorizes automatic production release after main checks. If told to merge
  without deploying, stop before merge and explain the conflict.
- After authorized merge, monitor main and perform relevant non-destructive
  release checks. Agent tasks, paid provider calls and data-changing production
  tests require explicit scope/permission. Merge permission does not grant
  blanket permission for database restore, rollback or server changes.
  Source fixes after merge use a new branch/MR with appropriate authorization;
  never direct-push main or reuse a merged MR's publication permission.
- Keep OpenSpec artifacts local. Record approved scope, acceptance criteria,
  decisions and sanitized evidence in the issue/MR so other agents can continue
  without private chat or local contracts. Do not force-add ignored OpenSpec or
  silently remove already tracked history.
- Documentation-only changes need diff/link/source checks, not an invented
  runtime proof or unsolicited production execution. Report that runtime was
  unchanged. Existing product proof rules below apply to code/behavior changes.




\## Mission



Build usable product behavior, not demo code, mock theater, or test-only progress.



Every change must move the real application toward an end-user-visible outcome. A task is not done until the implemented behavior runs through the real app path and has proof.



\## Work Order



1\. Read the task, README.md, PRD.md, ARCHITECTURE.md, docs/development.md, the active change contract linked from its GitLab Issue, existing code, and relevant configs before coding. Read INFO.md in a directory when additional context is needed. Use src/VERIFICATION.md for checks and docs/deployment.md for releases.

2\. Identify the real user flow, API path, CLI path, or system behavior being changed.

3\. Implement production code first. Tests support the implementation; tests are not the deliverable.

4\. Wire the feature end-to-end through existing architecture. Do not bypass routing, auth, persistence, validation, background jobs, or UI state.

5\. Run verification commands and capture proof.

6\. Report exactly what changed, how it was verified, and what remains risky.



\## Definition of Done



A change is done only when all are true:



\- The real product path works from entrypoint to output.

\- The implementation is connected to actual app code, not isolated helper code.

\- Tests pass, but tests alone are insufficient.

\- At least one real execution proof is provided: browser flow, API curl, CLI run, DB query, job execution, screenshot, log, or trace.

\- No critical behavior depends on unverified mocks.

\- No TODO, placeholder, fake response, disabled test, skipped test, or hardcoded success path is introduced.

\- Existing behavior is preserved unless the task explicitly requires changing it.

\- Failure paths are handled with clear errors, not silent success.



\## Anti-Test-Trap Rules



Forbidden unless explicitly justified:



\- Writing only unit tests without implementing product behavior.

\- Making tests pass by changing expectations instead of fixing code.

\- Mocking the system under test.

\- Mocking internal modules just to avoid wiring the real dependency.

\- Adding snapshots as the main proof of correctness.

\- Skipping, deleting, or weakening tests to get green output.

\- Creating fake services, fake DBs, fake APIs, or fake auth while claiming end-to-end completion.

\- Returning hardcoded sample data from production paths.

\- Hiding errors with broad catch blocks, empty fallbacks, or `any`.



If a mock is necessary, state why. Acceptable reasons: external paid API, nondeterministic network, time, randomness, hardware, unavailable third-party service, or destructive side effect. Prefer realistic fixtures, local test containers, contract tests, or fakes over broad mocks.



\## Proof Contract



Every final response must include this block:



```text

PROOF

\- User path exercised:

\- Commands run:

\- Key outputs:

\- Files changed:

\- Real dependencies used:

\- Mocks used, with justification:

\- Remaining risks:

````



Proof must be concrete. Use command output, HTTP response, screenshot path, log excerpt, database row count, trace ID, or test result. Do not say “should work.”



\## Verification Ladder



Use the highest feasible level:



1\. Real product smoke test: UI/browser, API, CLI, or job run.

2\. Integration test with real app wiring.

3\. Contract test against real schema/interface.

4\. Unit test for edge cases.

5\. Static checks: typecheck, lint, format, security scan.



Do not stop at level 4 or 5 if level 1–3 is feasible.



\## Testing Policy



Tests must verify behavior, not implementation trivia.



Required when relevant:



\* Happy path.

\* Failure path.

\* Boundary case.

\* Persistence or state transition.

\* Authorization/authentication path.

\* API/UI contract.

\* Regression for fixed bug.



Avoid tests that only assert mocks were called unless the core behavior is interaction with an external boundary.



\## Architecture Rules



\* Follow existing patterns before introducing new ones.

\* Do not add dependencies without clear need and minimal scope.

\* Keep interfaces explicit and typed.

\* Keep business logic outside UI glue where possible.

\* Preserve migration compatibility and data integrity.

\* Prefer small vertical slices over broad partial rewrites.

\* Do not create parallel unused systems.



\## Workspace Standards



\* Keep each Git sub-repo independently runnable with its own README, dependency

&#x20; file, ignore rules, and verification command.

\* Keep generated artifacts out of repos: `\_\_pycache\_\_`, `.pytest\_cache`,

&#x20; `.ruff\_cache`, `.mypy\_cache`, `node\_modules`, build output, coverage output,

&#x20; local logs, and local `.env` files. Commit only reproducible examples.

\* Python services target Python 3.11+, explicit boundary types, narrow

&#x20; exceptions, and real FastAPI/CLI entrypoints. JavaScript/TypeScript code must

&#x20; pass the repo's existing lint/type/test scripts and must not add new `any`.

\* SurrealQL and SQL files must be deterministic, ordered, and safe to rerun

&#x20; when the existing migration runner expects idempotent behavior.

\* Repo boundaries are product boundaries. Cross-repo behavior goes through

&#x20; documented APIs, schemas, fixtures, compose wiring, or contract tests.



\## Change Discipline



Before editing, identify the minimum file set likely needed.



After editing:



\* Inspect diff.

\* Remove debug code.

\* Remove dead code.

\* Remove temporary files.

\* Ensure docs/configs reflect behavior changes.

\* Re-run verification after the final edit.



\## If Blocked



Do not fake completion.



Return:



```text

BLOCKED

\- Blocker:

\- Evidence:

\- What I tried:

\- Smallest next action:

```



\## Final Response Format



Use this structure:



```text

SUMMARY

\- What changed:

\- User-visible result:



PROOF

\- User path exercised:

\- Commands run:

\- Key outputs:

\- Files changed:

\- Real dependencies used:

\- Mocks used, with justification:

\- Remaining risks:



NEXT

\- Recommended next step:

```
