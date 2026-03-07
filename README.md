# duskpi

My personal configuration of the [pi coding agent](https://pi.dev).

This flake packages Pi together with this repo's bundled extensions, skills, prompts, and themes.

## Package

The main output is `packages.<system>.default`, a wrapped Pi package that includes:

- `bin/pi`
- `extensions/`
- `packages/`
- `skills/`
- `prompts/`
- `themes/`

The wrapper also preloads the bundled extensions, skills, prompt templates, and themes, so `nix run .#` works without any extra Pi settings. A bundled theme extension reads the package's `pi.theme` and activates it on startup.

## Themes

This package also ships Catppuccin themes for Pi under `themes/`:

- `catppuccin-latte`
- `catppuccin-frappe`
- `catppuccin-macchiato`
- `catppuccin-mocha`

These are copied into the default Nix package output so Pi can discover them as package themes.

## Workflow-style extensions

`extensions/bug-fix`, `extensions/owasp-fix`, `extensions/test-audit`, and `extensions/refactor-safety` share the same reusable workflow runtime:

- Extension entrypoints and domain-specific policy live in `extensions/*/*.ts`.
- Shared workflow primitives live in `packages/workflow-core/src/*`.
- Runtime prompts are co-located in each extension's `prompts/*.md`.
- `packages.<system>.default` in `flake.nix` wraps the `pi` package from `numtide/llm-agents.nix` together with all bundled Pi resources from this repo.

This keeps prompt ownership explicit while shipping a single Pi package with the expected behavior.
