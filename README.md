# dusk-skills

My personal collection of skills.

## Workflow-style extensions

`extensions/bug-fix` and `extensions/owasp-fix` share the same reusable workflow runtime:

- Extension entrypoints and domain-specific policy live in `extensions/*/*.ts`.
- Shared workflow primitives live in `packages/workflow-core/src/*`.
- Runtime prompts are co-located in each extension's `prompts/*.md`.
- `packages.<system>.pi-bug-fix` and `packages.<system>.pi-owasp-fix` in `flake.nix` copy the chosen extension plus `packages/workflow-core`.

This keeps prompt ownership explicit while enabling reuse across workflow-style extensions.
