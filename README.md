# dusk-skills

My personal collection of skills.

## Bug fix extension

The `extensions/bug-fix` module is split into entrypoint + reusable workflow runtime:

- Extension entrypoint lives in `extensions/bug-fix/index.ts`.
- Shared workflow runtime lives in `packages/workflow-core/src/bug-fix/*`.
- Runtime prompts are co-located in `extensions/bug-fix/prompts/*.md`.
- `packages.<system>.pi-bug-fix` in `flake.nix` copies both `extensions/bug-fix` and `packages/workflow-core`.

This keeps prompt ownership explicit while enabling reuse across workflow-style extensions.
