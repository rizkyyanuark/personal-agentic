# Agentic Enterprise

<p align="center"><img src="src/frontend/public/agentic-enterprise-logo.png" alt="Agentic Enterprise" width="180"></p>

A native workspace for agent groups, project chats, delegated work, knowledge, and local or SSH workspaces. Optional decentralized workers add Matrix transport and isolated runtimes.

## Run locally

Requirements: Windows, PowerShell 7, Rust, Node.js/npm, Git, and a signed-in Codex CLI. From the repository root:

```powershell
pwsh -NoProfile -File src/scripts/Build.ps1
pwsh -NoProfile -File src/scripts/Start.ps1
```

Open `http://127.0.0.1:8765` and sign in with the key created under `org/.state/owner.key`. Stop with `pwsh -NoProfile -File src/scripts/Stop.ps1`.

## Maintain

From `src`:

```powershell
cargo fmt --all --check
cargo test --workspace --locked
npm run lint --workspace frontend
npm run build --workspace frontend
```

See [platform documentation](src/README.md), [deployment and worker setup](src/DEPLOYMENT.md), [verification](src/VERIFICATION.md), and [upstream sources](src/UPSTREAM.md). `org/` and `workdir/` contain local state and attached codebases; both are excluded from Git.

**Organization → Public Live Office** opens `/office` in a new tab. Every visitor,
including signed-in users, sees the workspace explicitly published by the bootstrap
owner in Workspace settings. Nothing is published automatically. **Workspace preview**
opens the authenticated `/organization/live-preview` with private workspace/team selection.
Agent cards focus their original desk; character name tags follow the character.
Owner-only setup and mapping remain in the main application. The office observes
real work started through chat or Actions and never starts work on its own.
See the [Live Office review record](src/cockpit/docs/live-office-review.md) for
the accepted scope and verification limits. Detailed OpenSpec contracts remain
local and are not included in a fresh clone.

The React UI and Three.js scene are private npm workspaces under `src/frontend`
and `src/cockpit`. Install web dependencies with `npm ci` from `src`; Docker builds
one frontend bundle served by Rust on the same origin. See [the cockpit workspace](src/cockpit/README.md).

## Development contracts

Use [the development workflow](docs/development.md), [contribution rules](CONTRIBUTING.md), and [architecture map](ARCHITECTURE.md). GitLab issues/MRs record approved scope, acceptance criteria, decisions and evidence summaries. OpenSpec proposals, specs and tasks remain local; changes to behavior, API, data, access, runtime or deployment need an approved contract, while small fixes use the MR checklist. [AGENTS.md](AGENTS.md) defines agent authority and required proof. Publication needs permission; merge needs separate permission and triggers the automatic release described in the [deployment runbook](docs/deployment.md).

## Development and releases

See [the deployment runbook](docs/deployment.md) for the GitLab release
path, GitHub downstream copy, independent production state and release
requirements. CI uses the existing ARM64 workspace runners, with bounded
resources and one shared manager limited to one personal-agentic job at a time.
Other projects have separate managers and can still run concurrently. Production
Compose, bootstrap, restricted image promotion and HTTPS proxy configuration
live in `infra/production`.

The pipeline checks registry authentication, builds and smoke-tests an ARM64
image, then automatically deploys the tested digest after a merge to protected
`main`. Busy production work makes deployment fail clearly for later retry.
Deployment drain has been removed. Backups, authenticated smoke, fixed release
identity and restricted SSH remain. Main release `ec70e328` passed pipeline #61
and deployed on 13 October 2026; the runbook records that release snapshot.

## License

Original project code is licensed under the Apache License 2.0. Third-party components retain their respective licenses; see [LICENSE](LICENSE) and [upstream notices](src/UPSTREAM.md).
