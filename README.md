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
one frontend bundle served by Rust on the same origin. See the
[integration strategy](docs/cockpit-integration-strategy.md).

## Development and releases

See [the dev/prod workflow](docs/DEV-PROD-WORKFLOW.md) for the GitLab release
path, GitHub downstream copy, independent production state and activation
requirements. The GitLab pipeline uses project runner #3 on the existing
ARM64 workspace EC2. Verification jobs have CPU, memory, and swap limits;
the full merge-request pipeline has passed. Production deployment is a
separate setup step.

The pipeline also checks registry authentication and exports the verified ARM64
binary/frontend for image packaging. Image build/publish and digest smoke jobs
are prepared; activating their rootless builder requires approval of the
dedicated host security profiles described in the workflow. The current
verification runner retains its existing security settings.

## License

Original project code is licensed under the Apache License 2.0. Third-party components retain their respective licenses; see [LICENSE](LICENSE) and [upstream notices](src/UPSTREAM.md).
