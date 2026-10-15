# ARF-001: saved Antigravity run documents

Work item: [GitLab issue #1](https://gitlab.tugasakhir.space/rizkyyanuark/personal-agentic/-/work_items/1).

This contract records the owner's accepted decisions and the resulting implementation. It does not claim that this Markdown package existed before implementation or that local verification constitutes a production release.

## Problem and scope

A reply can link a Markdown document in a remote Antigravity `brain/<session>` directory. The existing workdir viewer correctly rejects that path outside the run's workdir, leaving the user unable to open the document.

Use the existing Artifact persistence and preview to save explicitly linked Markdown documents. Preserve the generic viewer's containment rules and the controller filesystem's bootstrap-owner boundary. No new database, provider, storage service or automatic Knowledge indexing is introduced.

## Requirements and acceptance

| ID | Requirement | Scenario |
| --- | --- | --- |
| ARF-R1 | Capture linked Markdown before publishing a completed run's reply. Bind source access to the recorded host, run and native session. | A real SSH Antigravity run publishes a document attachment; the saved bytes open from its reply. |
| ARF-R2 | Saved bytes and provenance remain independent of the source connection. | Removing or disconnecting the source leaves preview bytes and SHA-256 unchanged. |
| ARF-R3 | Recover an old link only through explicit per-document import. Label its version at import. | Opening the old failed link offers recovery; import records its timestamp and does not change the original run outcome or native session. |
| ARF-R4 | Export requires both saved and current workdir write permission, controller filesystem access, a contained relative destination and no existing file. | An authorized export preserves bytes; read-only, invited workspace owner, traversal and overwrite attempts fail without writing. |
| ARF-R5 | Owner-authenticated, group/workspace-scoped access protects source reads and stored content. | A non-bootstrap workspace owner cannot import/export controller files; their existing permitted saved-content reads remain available. |
| ARF-R6 | Capture and recovery do not add Knowledge. | The saved artifact remains outside Knowledge until the existing explicit action is selected. |
| ARF-R7 | Source reads are bounded and reject unsafe paths, encodings and sessions. | Invalid session/path, symlink escape, oversize and non-UTF-8 sources fail clearly. |

## Boundaries and decisions

- Initial scope is linked Markdown on local controllers and SSH workstations. Registered runtimes, arbitrary brain browsing and bulk historical imports are excluded.
- Capture accepts at most 16 linked documents, at most 1 MiB each, with a 35-second admission budget. An in-flight SSH read can exceed that budget.
- Linux/SSH uses descriptor-anchored access. Native Windows concurrent ancestor replacement lacks that guarantee and was not verified here.
- Historical imports save the version read at import; they cannot attest to bytes at the old run's completion.
- Linked images and auxiliary files remain separate references.
- Existing artifact JSON gains optional provenance and classification fields; old records remain readable without a database migration.
- [Pinned CCCC and Paperclip precedents](../../../../src/UPSTREAM.md) support validated scope, durable stored deliverables and run provenance. The exact Antigravity brain/session adapter is this application's extension.

## Implementation and release

The minimum affected modules are the existing API/platform authorization gate, run/artifact models, runtime completion, source transports, Markdown preview, generated bindings and the existing SSH CI job. The existing SQLite and artifact files remain authoritative.

See [tasks](tasks.md) and [verification](verification.md). Merge and production rollout are separate decisions from the accepted local implementation and Draft MR publication.
