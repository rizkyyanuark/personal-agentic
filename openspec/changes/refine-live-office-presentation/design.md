# Context

Pinned reference ad92a7a473b3d0e769281d552cee74cbb4004a54 renders feed entries without badges/links; card subtext reports work or waiting. Work bubbles clip to 48 Unicode characters and are suppressed on mobile. Reference guitar itself uses an X reflection and an awkward downward neck; literal parity cannot fix it.

# Decisions

- Preserve run/step metadata and true failures internally, but make feed rows passive text with no run link or completion/tool badges. Keep failure wording in descriptions.
- Owner confirmed removing the transient Selesai card state. Cards retain scene action plus waiting context; full operational history stays in its existing panel.
- Uniform white bubble surface/tail. Work/event previews 48 graphemes, dialogue 96; inner text clamps to 3 desktop/2 mobile lines while the tail remains visible. Full text/kind stays in card/detail data. At widths up to 820px, suppress every non-dialogue bubble, including transient work events; retain the full work description in cards/details.
- Rig front is +Z. Anatomical left is +X although legacy arm names suggest the reverse. Use a proper Z rotation, not reflection, to place the neck upward toward anatomical left; keep the opposite hand strumming. Do not infer handedness from legacy variable names.
- Acoustic body has a flat soundboard, six strings/tuners and fret geometry. Mount ahead of torso; hand targets account for palm radius and actual surfaces. Solve the rigid guitar grips exactly while torso lean blends, including the first arrival frame. Verify all five characters under animated and reduced motion.

# Verification

Real Three.js geometry tests and normal lint/format/unit/build checks; real source-built application with unmocked API, passive feed assertions, full-text/overflow checks at five widths, natural guitar activity and a real provider task for work bubbles. Keep prior evidence and avoid production, commit, push and deploy.

# Completion outcome follow-up

Carry only already-public active run IDs and latest result ID/status through the
JS snapshot/presentation adapter. Emit completion speech only after a fresh, visible
working snapshot with exactly one observed active run changes to idle/no active
runs and that same run is explicitly succeeded. Missing/malformed provenance,
stale/other results, failed/cancelled/timed_out/interrupted or ambiguous parallel
work must not produce success speech. Do not infer success from latestFailure=false.
