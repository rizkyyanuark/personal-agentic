# Why

Owner review found display-only office clutter: step badges and run links, illustrative labels on every card, crowded highlighted bubbles, and a mirrored guitar. Correct the presentation using the pinned kantor-agent reference and the owner's explicit preferences.

# What Changes

- Make the activity list plain name/time/action, without badges or navigation into personal-agentic.
- Return completed agents directly to Santai. Keep scene activities on cards, replace Kegiatan visual with useful waiting context, and retain failure/offline/waiting facts.
- Use uniform white bubbles; shorten work previews to 48 graphemes, clamp visible lines, preserve full detail outside bubbles, and keep mobile work on cards as in the reference.
- Correct the inherited guitar mirror for right-handed playing, align anatomical hand contacts, add a coherent acoustic body/strings/frets and verify physical clearances.

# Capabilities

## New Capabilities
- `live-office-presentation`: passive feed/cards, readable bubbles and right-handed guitar presentation.

## Modified Capabilities
None in main specs. This owner-approved follow-up supersedes run-link, completed-card and visual-label presentation choices in earlier local changes; their historical receipts remain intact.

# Impact

Cockpit UI, snapshot and scene modules; relevant tests, DESIGN/architecture and verification. No backend, API, auth, persistence, provider or dependency changes. Implementation is explicitly requested. No commit, push or deploy.

Owner-approved P2 follow-up: completion speech must use actual succeeded outcome
and observed run identity, not an idle-state inference. Verify native success,
provider failure and application cancellation on the isolated local candidate.
