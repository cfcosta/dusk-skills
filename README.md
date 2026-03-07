# dusk-skills

My personal collection of skills.

## Home Manager module

This flake exports a Home Manager module at `homeModules.default` (also aliased as `homeManagerModules.default`). It mirrors the AI setup from my `home.nix` config:

- installs `pi`, `claude-code`, `codex`, `gemini-cli`, `opencode`, `crush`, and `beads`
- writes `~/.pi/agent/settings.json`
- registers the bundled Pi packages from this repo
- links the bundled skills into `~/.claude/skills` and `~/.codex/skills`
- can activate one of the bundled Catppuccin Pi themes

Example:

```nix
{
  imports = [ inputs.dusk-skills.homeModules.default ];

  programs.pi = {
    enable = true;
    catppuccin.enable = true;
    # or: theme = "catppuccin-mocha";
  };
}
```

## Themes

This package also ships Catppuccin themes for Pi under `themes/`:

- `catppuccin-latte`
- `catppuccin-frappe`
- `catppuccin-macchiato`
- `catppuccin-mocha`

These are copied into the default Nix package output so Pi can discover them as package themes.

## Workflow-style extensions

`extensions/bug-fix`, `extensions/owasp-fix`, and `extensions/test-audit` share the same reusable workflow runtime:

- Extension entrypoints and domain-specific policy live in `extensions/*/*.ts`.
- Shared workflow primitives live in `packages/workflow-core/src/*`.
- Runtime prompts are co-located in each extension's `prompts/*.md`.
- `packages.<system>.pi-bug-fix`, `packages.<system>.pi-owasp-fix`, and `packages.<system>.pi-test-audit` in `flake.nix` copy the chosen extension plus `packages/workflow-core`.

This keeps prompt ownership explicit while enabling reuse across workflow-style extensions.
