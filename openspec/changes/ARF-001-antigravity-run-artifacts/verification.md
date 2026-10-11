# ARF-001 verification

This is a sanitized record of local acceptance on 11 October 2026. Private run records, credentials, screenshots and backups remain in the ignored `scratch/run-artifacts-proof/` directory. They are not published in Git.

## Existing local proof

| Check | Result |
| --- | --- |
| Docker verification target: Rust format and full locked workspace tests | 140 passed before the subsequent authorization review correction. |
| Actual Linux SSH transport: `backend/tests/run_documents.py` and `backend/tests/antigravity_skills.py` | 21 document checks and 24 skill checks passed. |
| `npm run check --workspace cockpit` | 203 tests, lint, formatting and build passed. |
| Frontend source lint and build | `npm run lint --workspace frontend -- src` and `npm run build` passed. |
| Original failed historical document, real browser/API | Recovery returned 6,971 bytes; original run/session unchanged; import-time label visible. |
| Saved preview with candidate SSH connection unavailable | Saved bytes unchanged and readable. |
| Actual Antigravity run on the candidate image | Completed run attached its captured Markdown to the published reply. |
| Explicit export, traversal, overwrite and read-only checks | Successful bytes matched; rejected operations failed without writing. |
| Knowledge separation | Neither automatic capture nor historical recovery added Knowledge. |
| Local replacement | Stopped-state backup and SQLite checks passed; original runs/profiles/groups and environment/mounts preserved. |

No internal module, provider, database, filesystem or authentication mock was used in those product flows. Temporary QA data used actual app persistence and a real configured provider. Package tests do not by themselves prove provider execution.

## Final authorization correction

Independent review found that the new source-import/export routes needed the existing bootstrap-owner filesystem guard. Both the platform router and the import/export modules now preserve that boundary. Document metadata and previously stored copies remain readable according to the existing group permissions.

The final-source Docker verification target ran `cargo fmt --all --check` and `cargo test --workspace --locked --jobs 2`: **142 passed, 0 failed, 0 ignored**. The real platform regression uses the membership invitation API and persisted SQLite sessions: an invited owner receives HTTP 403 for source import and export, while permitted metadata and stored previews return HTTP 200. Denied operations create no artifact or destination file. Bootstrap-owner operations continue to work. A separate regression exercises the non-default workspace boundary directly.

The auth regression seeds the login/session record to avoid an external Matrix sign-in. It uses the actual router, membership checks, database and filesystem; the external Matrix login flow itself was not exercised. Final-source `cargo build --locked --jobs 2` also passed.

The Draft MR's pipeline provides verification on the committed source. Production release evidence belongs to the deployment record, separately from this local record.

## Limits

This change's production rollout, native Windows execution, registered-runtime capture and manual Knowledge indexing have not been exercised. Linked images are not captured. Windows descriptor/race parity and host-wide CI capacity are not established by the local checks. Follow the existing [verification guide](../../../src/VERIFICATION.md) and [release runbook](../../../docs/DEV-PROD-WORKFLOW.md) for the relevant gates.
