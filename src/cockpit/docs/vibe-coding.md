# AI-assisted development guide

This repository is arranged for short, reviewable vertical slices. A useful
request names the user-visible outcome, the source of truth, constraints, and
the check that proves completion.

## Working pattern

1. Start from a concrete behavior, such as “show a stale worker badge from the
   existing queue state.”
2. Ask the agent to read `AGENTS.md`, the architecture, and the owning module.
3. Keep the first change within one boundary: scene, UI, transport, or server
   projection.
4. Build immediately. Fix build errors before expanding the task.
5. For visual work, capture the supported viewport and inspect the screenshot.
6. Compare displayed claims with Rust `/api/cockpit/state`; unknown data stays unknown.
7. Record an architectural decision only when a boundary or source of truth
   changes.

## Prompt template

```text
Outcome:
Source of truth:
Files or boundary in scope:
Constraints:
Acceptance check:
```

## Why these rules exist

- Three.js applications are scene graphs rendered through a camera and
  renderer, so scene construction stays modular:
  https://threejs.org/manual/en/fundamentals.html
- Vite treats source and public assets differently and produces a deployable
  build, so dependencies come from npm instead of copied vendor trees:
  https://vite.dev/guide/assets.html
- Repository instructions give coding agents durable architecture and workflow
  context:
  https://docs.github.com/en/copilot/how-tos/configure-custom-instructions-in-your-ide/add-repository-instructions-in-your-ide
- GitHub's vibe coding tutorial recommends documenting architecture,
  workflows, conventions, and integration points:
  https://docs.github.com/en/copilot/tutorials/vibe-coding
- Agent systems benefit from starting with the simplest sufficient workflow and
  adding complexity only when evidence requires it:
  https://www.anthropic.com/engineering/building-effective-agents
