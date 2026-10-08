# ADR 0002: Separate verification from deployment

- Status: accepted
- Date: 2026-09-27

## Context

AI-assisted changes need fast feedback without granting a coding agent implicit
permission to restart a public service. A successful bundle alone does not prove
the API boundary or responsive layout.

## Decision

`npm run check` is the required deterministic gate and covers lint, format,
unit/integration tests, and production build. The assertion-based browser suite
is run against an explicitly selected live URL for UI changes. GitLab CI runs the
deterministic gate. The systemd file is versioned as a template, while installing
or restarting it remains a separate owner-approved operation.

## Consequences

Most regressions fail before deployment, and infrastructure drift becomes visible
in review. Browser execution remains outside the default CI job because Chromium
availability and a running service are environment-specific; it is still required
locally for UI delivery under the Proof Contract.
