import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ExtensionAPI } from "../../packages/workflow-core/src/index";

interface ThemePackageManifest {
  pi?: {
    theme?: string;
  };
}

export default function themeDefault(api: ExtensionAPI): void {
  api.on("session_start", async (_event, ctx) => {
    const themeName = readThemeFromPackage();
    if (!themeName) {
      return;
    }

    const result = ctx.ui.setTheme(themeName);
    if (!result.success) {
      ctx.ui.notify(
        `Failed to activate default theme '${themeName}': ${result.error ?? "unknown error"}`,
        "error",
      );
    }
  });
}

function readThemeFromPackage(): string | undefined {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  let current = moduleDirectory;

  while (current !== path.dirname(current)) {
    const packageJsonPath = path.join(current, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(
        fs.readFileSync(packageJsonPath, "utf8"),
      ) as ThemePackageManifest;
      return packageJson.pi?.theme;
    }
    current = path.dirname(current);
  }

  return undefined;
}
