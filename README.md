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

**Organization → Live Preview** opens the read-only 3D office in a nearly fullscreen
floating window above Organization. Agent cards keep their original desk-camera focus.
Use **Create missing cockpit profiles** once to add Orion, Nova, Atlas, Lyra and
Axiom. The profiles remain paused until you attach their runtime/workdir and
configure them. Orion reports to the workspace owner; the four specialists report
to Orion. Existing agents are preserved. The preview observes real work started
through chat or Actions and never starts work on its own.

The React UI and Three.js scene are private npm workspaces under `src/frontend`
and `src/cockpit`. Install web dependencies with `npm ci` from `src`; Docker builds
one frontend bundle served by Rust on the same origin. See [the cockpit workspace](src/cockpit/README.md).

## Development contracts

Use [the AI-assisted development workflow](docs/development.md), [the architecture map](ARCHITECTURE.md), and [change contracts](openspec/README.md) when developing this product. GitLab Issues own priority and work status; versioned contracts own scope, scenarios, task dependencies and acceptance evidence. Changes to API, data, access, runtime or deployment need a contract; small fixes use the MR checklist. [AGENTS.md](AGENTS.md) defines the required real-product proof.

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
