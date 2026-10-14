# Native Antigravity activity through the existing Rust run path

Date: 2026-10-07. Owner preferences confirmed through the integration questionnaire.

The five cockpit characters remain mapped to five Organization profiles. Orion
reports to the workspace owner, and four specialists report to Orion. Their
project work is run through personal-agentic's authenticated messages, sessions,
queue, delegation validation and persisted results. No observer daemon or second
scheduler is introduced.

Direct SSH invokes the host's native `agy` and catalog, rather than borrowing
Codex configuration. `@Orion` in a project chat creates a Coordinator run;
specialist mentions create Direct runs. Schema decisions are validated by Rust,
delegates run through the existing queue, and an ordinary summary is persisted
back to chat. Native subagents remain details of the parent platform run.

Rust normalizes native step transitions into `run.activity`. The public cockpit
projection exposes only run identity, category, state, step index and a sanitized
relative filename. It does not expose native arguments, outputs, private absolute
paths, prompts or credentials. Lifecycle success requires a native completion
receipt and process exit; a completed file read is not task completion.

Usage is counted from complete per-step measurements, deduplicated by native
conversation and step. The final conversation total cannot be added again on
resume. Missing or incomplete measurement remains unknown with coverage. Only
personal-agentic-started work is monitored, using existing two-second polling.

The original geometry, styles, overlay, camera interactions and outer Live Preview
header are preserved. The presentation adapter supplies real activity to existing
cards and panels. Shared project work is serialized for the pilot; review does
not retry a failed task.

Platform MCP tools are not attached to this AGY slice. They need a verified native
configuration boundary before owner questions and enterprise tool calls can be
enabled. No ephemeral token is written into global or project native config.
Registered workers and event-based updates remain subsequent work, not alternate
paths enabled by this decision.
