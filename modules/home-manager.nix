{ self }:
{
  config,
  lib,
  pkgs,
  ...
}:
let
  inherit (lib)
    mkEnableOption
    mkIf
    mkOption
    optionalAttrs
    recursiveUpdate
    types
    unique
    ;

  cfg = config.programs.pi;

  flavor = if config.catppuccin.enable or false then config.catppuccin.flavor else cfg.catppuccin.flavor;

  resolvedTheme = if cfg.catppuccin.enable then "catppuccin-${flavor}" else cfg.theme;

  baseSettings = {
    defaultProvider = cfg.defaultProvider;
    defaultModel = cfg.defaultModel;
    packages = map toString cfg.piPackages;
  }
  // optionalAttrs (resolvedTheme != null) {
    theme = resolvedTheme;
  };
in
{
  options.programs.pi = {
    enable = mkEnableOption "Pi coding agent and bundled dusk-skills packages";

    package = mkOption {
      type = types.package;
      default = pkgs.pi;
      description = "Pi package to install in the user environment.";
    };

    toolPackages = mkOption {
      type = types.listOf types.package;
      default = with pkgs; [
        beads
        claude-code
        codex
        crush
        gemini-cli
        opencode
      ];
      defaultText = lib.literalExpression "with pkgs; [ beads claude-code codex crush gemini-cli opencode ]";
      description = "Packages installed into home.packages for the AI tooling setup.";
    };

    defaultProvider = mkOption {
      type = types.str;
      default = "openai-codex";
      description = "Default Pi provider written to ~/.pi/agent/settings.json.";
    };

    defaultModel = mkOption {
      type = types.str;
      default = "gpt-5.4";
      description = "Default Pi model written to ~/.pi/agent/settings.json.";
    };

    piPackages = mkOption {
      type = types.listOf types.package;
      default = let packages = self.packages.${pkgs.stdenv.hostPlatform.system}; in [
        packages.default
        packages.pi-bug-fix
        packages.pi-owasp-fix
        packages.pi-test-audit
      ];
      description = "Pi package paths added to the settings.json packages list.";
    };

    settings = mkOption {
      type = types.attrs;
      default = { };
      description = "Extra settings merged into ~/.pi/agent/settings.json. This can override defaults.";
    };

    theme = mkOption {
      type = types.nullOr types.str;
      default = null;
      description = "Theme name to set in Pi settings. Ignored when programs.pi.catppuccin.enable is true.";
    };

    catppuccin = {
      enable = mkEnableOption "install and activate one of the bundled Catppuccin Pi themes";

      flavor = mkOption {
        type = types.enum [
          "latte"
          "frappe"
          "macchiato"
          "mocha"
        ];
        default = "mocha";
        description = "Catppuccin flavor to use for Pi. If catppuccin.enable is set globally, that flavor is reused.";
      };

      package = mkOption {
        type = types.package;
        default = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
        description = "Package providing the Catppuccin Pi theme files.";
      };
    };
  };

  config = mkIf cfg.enable {
    home.packages = unique (cfg.toolPackages ++ [ cfg.package ]);

    home.file = {
      ".pi/agent/settings.json".text = builtins.toJSON (recursiveUpdate baseSettings cfg.settings);

      ".claude/skills" = {
        source = "${self.packages.${pkgs.stdenv.hostPlatform.system}.default}/skills";
        recursive = true;
      };

      ".codex/skills" = {
        source = "${self.packages.${pkgs.stdenv.hostPlatform.system}.default}/skills";
        recursive = true;
      };
    }
    // optionalAttrs cfg.catppuccin.enable {
      ".pi/agent/themes/catppuccin-${flavor}.json".source =
        "${cfg.catppuccin.package}/share/pi/themes/catppuccin-${flavor}.json";
    };
  };
}
