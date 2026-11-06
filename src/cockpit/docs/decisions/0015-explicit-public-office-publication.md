# ADR 0015: One explicitly published public office

Date: 6 November 2026.
Status: approved for local implementation in issue #13; production publication
requires the installation owner's explicit action.

## Context

Anonymous office reads used the default workspace, while signed-in viewers used
their browser-selected workspace. Sharing `/office` therefore showed different
agents or an unmapped office. The owner requested one consistent public target
from any browser/device, with existing safe presentation fields retained.

## Decision

Store one nullable workspace target and monotonic revision in platform SQLite.
Only the bootstrap owner can change it, and must own the active target workspace.
New installations publish nothing. Stopping works even when the target is broken.

Serve the existing sanitized cockpit projection through a separate public envelope.
Ignore all visitor identity/selection inputs; disable caching and recheck target
eligibility/revision after projection. Keep internal preview authenticated and
workspace/filter-aware. Public viewing never configures agents or starts tasks.

Clear the public scene on target changes, missing/invalid data, network expiry and
visibility changes so old identities cannot remain under a new publication. Keep
the mount/camera during ordinary same-target polling. Cameras and roaming remain
local animations; this decision does not introduce synchronized simulation.

Use existing settings typography, spacing and controls so publication belongs to
workspace management. The target is a draft until Publish; current publication
and uncertain-save reconciliation remain separate. Disclosure precedes the action
because profiles, group/project names and sanitized activity are intentionally public.

The owner approved the compact integrated settings direction after local review.
Keep a short disclosure visible and reveal the full field list on demand using
the installed Base UI Collapsible. Confirmed publication is separate from a new
selection; an unchanged published target cannot be resubmitted. Header refresh
and a visible reconciliation action share the same read path. Short disclosure
transitions use CSS with reduced-motion support, without a new animation library.

## Verification

Real SQLite/router tests cover authority, persistence, selectors and source-field
exclusion. The owned loopback browser suite covers independent viewers, real mesh
visibility/focus, private context, restart, revocation, deletion and transport loss.
Persisted run/activity records are labeled fixtures; they are not provider execution.
