import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import themeDefault from "./index";

type ThemeResult = { success: true } | { success: false; error?: string };

test("themeDefault registers session_start and activates configured theme", async () => {
  const originalExistsSync = fs.existsSync;
  const originalReadFileSync = fs.readFileSync;

  const handlers: Record<string, (event: unknown, ctx: unknown) => Promise<void> | void> = {};
  const activatedThemes: string[] = [];
  const notifications: Array<{ message: string; level: string }> = [];

  fs.existsSync = ((path) => {
    if (String(path).includes("extensions/pi-catppuccin/package.json")) {
      return true;
    }

    return originalExistsSync(path);
  }) as typeof fs.existsSync;

  fs.readFileSync = ((path, options?) => {
    if (String(path).includes("extensions/pi-catppuccin/package.json")) {
      return '{"pi":{"theme":"catppuccin-mocha"}}';
    }

    return originalReadFileSync(path, options as never);
  }) as typeof fs.readFileSync;

  try {
    themeDefault({
      on(event: string, handler: (event: unknown, ctx?: unknown) => Promise<void> | void) {
        handlers[event] = handler as (event: unknown, ctx: unknown) => Promise<void> | void;
      },
    } as never);

    assert.ok(handlers.session_start);

    await handlers.session_start(
      {},
      {
        ui: {
          setTheme(themeName: string): ThemeResult {
            activatedThemes.push(themeName);
            return { success: true };
          },
          notify(message: string, level: string) {
            notifications.push({ message, level });
          },
        },
      },
    );

    assert.deepEqual(activatedThemes, ["catppuccin-mocha"]);
    assert.equal(notifications.length, 0);
  } finally {
    fs.existsSync = originalExistsSync;
    fs.readFileSync = originalReadFileSync;
  }
});

test("themeDefault does nothing when no configured theme is discovered", async () => {
  const originalExistsSync = fs.existsSync;
  const originalReadFileSync = fs.readFileSync;

  const handlers: Record<string, (event: unknown, ctx: unknown) => Promise<void> | void> = {};
  const activatedThemes: string[] = [];

  fs.existsSync = ((path) => {
    if (String(path).includes("extensions/pi-catppuccin/package.json")) {
      return true;
    }

    return originalExistsSync(path);
  }) as typeof fs.existsSync;

  fs.readFileSync = ((path, options?) => {
    if (String(path).includes("extensions/pi-catppuccin/package.json")) {
      return '{"name":"@duskpi/pi-catppuccin"}';
    }

    return originalReadFileSync(path, options as never);
  }) as typeof fs.readFileSync;

  try {
    themeDefault({
      on(event: string, handler: (event: unknown, ctx?: unknown) => Promise<void> | void) {
        handlers[event] = handler as (event: unknown, ctx: unknown) => Promise<void> | void;
      },
    } as never);

    assert.ok(handlers.session_start);

    await handlers.session_start(
      {},
      {
        ui: {
          setTheme(themeName: string): ThemeResult {
            activatedThemes.push(themeName);
            return { success: true };
          },
          notify() {},
        },
      },
    );

    assert.deepEqual(activatedThemes, []);
  } finally {
    fs.existsSync = originalExistsSync;
    fs.readFileSync = originalReadFileSync;
  }
});

test("themeDefault notifies when theme activation fails", async () => {
  const originalExistsSync = fs.existsSync;
  const originalReadFileSync = fs.readFileSync;

  const handlers: Record<string, (event: unknown, ctx: unknown) => Promise<void> | void> = {};
  const notifications: Array<{ message: string; level: string }> = [];

  fs.existsSync = ((path) => {
    if (String(path).includes("extensions/pi-catppuccin/package.json")) {
      return true;
    }

    return originalExistsSync(path);
  }) as typeof fs.existsSync;

  fs.readFileSync = ((path, options?) => {
    if (String(path).includes("extensions/pi-catppuccin/package.json")) {
      return '{"pi":{"theme":"catppuccin-mocha"}}';
    }

    return originalReadFileSync(path, options as never);
  }) as typeof fs.readFileSync;

  try {
    themeDefault({
      on(event: string, handler: (event: unknown, ctx?: unknown) => Promise<void> | void) {
        handlers[event] = handler as (event: unknown, ctx: unknown) => Promise<void> | void;
      },
    } as never);

    assert.ok(handlers.session_start);

    await handlers.session_start(
      {},
      {
        ui: {
          setTheme(): ThemeResult {
            return { success: false, error: "boom" };
          },
          notify(message: string, level: string) {
            notifications.push({ message, level });
          },
        },
      },
    );

    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]?.level, "error");
    assert.match(notifications[0]?.message ?? "", /catppuccin-mocha/);
    assert.match(notifications[0]?.message ?? "", /boom/);
  } finally {
    fs.existsSync = originalExistsSync;
    fs.readFileSync = originalReadFileSync;
  }
});
