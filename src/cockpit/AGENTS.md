# AI Lab Cockpit agent instructions

## Purpose

Build the read-only 3D cockpit mounted in personal-agentic. Preserve the boundary
between visualization and execution: browser code never approves actions,
executes workers, exposes task payloads, or reads the vault.

## Read first

1. Read the root integration strategy and the integration amendment in `PRD.md`.
2. Read `docs/architecture.md` for data and runtime boundaries.
3. For visible work, read `DESIGN.md` and `docs/visual-acceptance.md`.
4. Locate the smallest module that owns the requested behavior.
5. Inspect Rust `/api/cockpit/state` before adding UI fields. Do not invent live metrics.

## Skill routing

- Use `antislop` with `antislop-ui` for visible interface work.
- Add `antislop-layoutmobile` for responsive changes.
- Add `antislop-human` for interaction, focus, state, and accessibility work.
- Add `antislop-copywriting` when changing user-facing text.
- Use the narrowest relevant `threejs-*` skills for scene work. Common routes:
  `threejs-fundamentals` for scene structure, `threejs-lighting` for light and
  shadows, `threejs-materials` for surfaces, `threejs-animation` for motion,
  and `threejs-interaction` for camera or selection behavior.
- Skills provide implementation guidance. `PRD.md`, `DESIGN.md`, and the public
  data contract remain the product sources of truth.

## Module boundaries

- `src/client/scene/`: Three.js scene graph and visual objects.
- `src/client/ui/`: DOM panels, cards, labels, and interaction.
- `src/client/mount.js` and `snapshot.js`: package lifecycle and safe presentation adapter.
- Parent React frontend: authenticated polling, workspace filter, profile configuration.
- Parent Rust backend: safe persisted projection and owner authorization.
- `index.html`: development-only page backed by the real Rust API.
- `tests/legacy/`: predecessor HTTP and ledger test fixtures, never production services.

Do not put DOM rendering in scene modules or SQLite access in browser modules.
Keep one canonical implementation; remove compatibility aliases after callers
are migrated.

## Delivery loop

Implement one visible behavior at a time. Run `npm run check` after every
slice. For visual changes, run `npm run test:e2e` against the live service and
inspect every screenshot named by `docs/visual-acceptance.md`. State what
changed, what was verified, and what remains uncertain.

Avoid generated demo activity, placeholder metrics, broad rewrites, copied
vendor trees, and new dependencies without a concrete need.

## Proof Contract

Do not report a cockpit change as complete without evidence appropriate to its
risk:

- Run `npm run check` for every code or configuration change.
- Run `npm run test:e2e` for UI, layout, accessibility, or transport changes.
- Name the exact command and outcome; do not substitute visual confidence for
  an assertion.
- For public-state changes, add or update a test proving both the allowed fields
  and the private fields that must never cross `/api/cockpit/state`.
- For deployment changes, verify the root Docker/native application path. The
  archived systemd templates do not deploy this package.
- Record durable boundary or dependency decisions in `docs/decisions/`.

If a required check cannot run, state the blocker and leave the work explicitly
unverified. Never weaken or delete a failing assertion to obtain a green run.

## Mandatory Proactive Alignment & Sequential Thinking Protocol

Before composing any requirements document (`docs/requirements/`), creating architectural decision records (`docs/decisions/`), or executing visual/architectural changes:

1. Always engage the `sequential-thinking` tool to systematically analyze requirements, compare alternatives, inspect constraints, and structure the engineering plan.
2. Always ask the project owner clarifying questions with concrete recommendations using the `ask_question` tool or a structured interactive clarifying questionnaire.
3. Explicitly wait for the user's confirmation and preferences before committing changes or drafting final requirement baselines.
