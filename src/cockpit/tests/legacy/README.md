# Predecessor regression fixtures

These modules preserve the imported AI Lab ledger projection, Express boundary,
and polling client so their original privacy, HTTP, and foreground-recovery
assertions remain enabled under `tests/unit`. They are fixtures for predecessor
regressions, not a production service or current product API.

Production authentication, projection, mapping, privacy, and workspace isolation
are tested against real Rust app wiring in `backend/src/cockpit.rs`. The package
`test:e2e` script runs `frontend/tests/cockpit-live.mjs` against the real Rust
application. Preserved fixture tests support the migration; they do not prove
that the current backend works.

The imported `tests/e2e` scripts refer to the predecessor's page/global interface
and are retained as visual-regression references. They are superseded as the
product gate by the integrated browser suite, which checks all five inherited
viewport widths. Pure-scene motion, seating, pose, labels, and DOM accessibility
regressions remain enabled in `tests/unit`.
