# dusk-skills

My personal collection of skills.

## Bug fix extension

The `extensions/bug-fix` module is self-contained:

- Runtime code lives in `extensions/bug-fix/index.ts`.
- Runtime prompts are co-located in `extensions/bug-fix/prompts/*.md`.
- `packages.<system>.pi-bug-fix` in `flake.nix` copies the extension directory as-is, without build-time prompt renaming.

This keeps prompt ownership and runtime boundaries explicit.
