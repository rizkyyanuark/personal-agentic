# ADR 0001: Keep the cockpit a read-only public projection

- Status: accepted
- Date: 2026-09-27

## Context

The cockpit is publicly reachable and observes a private multi-agent runtime.
The runtime ledger contains project names, goals, inputs, results, checkpoints,
approval reasons, worker identities, lease tokens, and raw event data.

## Decision

The server selects only role, status, timestamps, lease expiry, event kind, and
aggregate counts. It maps these values to a shared public contract before they
reach the browser. The browser has no mutation endpoint. Role metadata has one
canonical source in `src/shared/office-contract.js`, consumed by the projection
and the UI. Any new public field requires a privacy test and explicit review.

## Consequences

The cockpit cannot display detailed task payloads or approve actions. Operators
must use the private agent channel for those workflows. A malformed or partially
unavailable configured ledger fails closed instead of showing misleading partial
counts. This intentionally favors confidentiality and truthful status over detail.
