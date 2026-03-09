import test from "node:test";
import assert from "node:assert/strict";
import {
  GuidedWorkflow,
  parseTrimmedStringArg,
  type ExtensionAPI,
  type ExtensionContext,
  type ExtensionTheme,
  type ExtensionUICustomFactory,
} from "./index";

function createContext() {
  const notifications: Array<{ level: string; message: string }> = [];
  const theme: ExtensionTheme = {
    fg(_color: string, text: string) {
      return text;
    },
    strikethrough(text: string) {
      return `~~${text}~~`;
    },
  };

  const ctx: ExtensionContext = {
    hasUI: true,
    ui: {
      theme,
      notify(message: string, level = "info") {
        notifications.push({ message, level });
      },
      setStatus() {},
      setWidget() {},
      async select() {
        return undefined;
      },
      async editor() {
        return undefined;
      },
      async custom<T>(factory: ExtensionUICustomFactory<T>): Promise<T> {
        let resolved!: T;
        await factory({}, theme, {}, (value) => {
          resolved = value;
        });
        return resolved;
      },
      setTheme() {
        return { success: true } as const;
      },
    },
  };

  return { ctx, notifications };
}

function createApi(): ExtensionAPI {
  return {
    sendMessage() {},
    sendUserMessage() {},
    registerCommand() {},
    getActiveTools() {
      return ["read", "bash"];
    },
    getAllTools() {
      return [
        { name: "read", description: "Read file contents" },
        { name: "bash", description: "Execute shell commands" },
      ];
    },
    setActiveTools() {},
    on() {},
  };
}

test("GuidedWorkflow starts idle", () => {
  const workflow = new GuidedWorkflow(createApi(), {
    id: "guided-test",
    parseGoalArg: parseTrimmedStringArg,
    text: { alreadyRunning: "guided running" },
  });

  assert.deepEqual(workflow.getStateSnapshot(), {
    phase: "idle",
    goal: undefined,
    pendingRequestId: undefined,
    awaitingResponse: false,
  });
});

test("GuidedWorkflow start command enters planning with parsed goal", async () => {
  const workflow = new GuidedWorkflow(createApi(), {
    id: "guided-test",
    parseGoalArg: parseTrimmedStringArg,
    text: { alreadyRunning: "guided running" },
  });
  const { ctx } = createContext();

  const result = await workflow.handleCommand("  investigate workflow reuse  ", ctx);

  assert.deepEqual(result, { kind: "ok" });
  assert.deepEqual(workflow.getStateSnapshot(), {
    phase: "planning",
    goal: "investigate workflow reuse",
    pendingRequestId: undefined,
    awaitingResponse: false,
  });
});

test("GuidedWorkflow blocks duplicate runs while active", async () => {
  const workflow = new GuidedWorkflow(createApi(), {
    id: "guided-test",
    parseGoalArg: parseTrimmedStringArg,
    text: { alreadyRunning: "guided running" },
  });
  const { ctx, notifications } = createContext();

  await workflow.handleCommand("first run", ctx);
  const secondRun = await workflow.handleCommand("second run", ctx);

  assert.deepEqual(secondRun, { kind: "blocked", reason: "already_running" });
  assert.deepEqual(notifications.at(-1), { level: "warning", message: "guided running" });
  assert.equal(workflow.getStateSnapshot().goal, "first run");
});

test("GuidedWorkflow scaffold lifecycle hooks are currently no-ops", async () => {
  const workflow = new GuidedWorkflow(createApi(), {
    id: "guided-test",
    parseGoalArg: parseTrimmedStringArg,
    text: { alreadyRunning: "guided running" },
  });
  const { ctx } = createContext();

  await workflow.handleCommand("first run", ctx);

  assert.equal(await workflow.handleToolCall({ toolName: "Read" }, ctx), undefined);
  assert.equal(await workflow.handleAgentEnd({ messages: [] }, ctx), undefined);
  assert.equal(await workflow.handleBeforeAgentStart({ systemPrompt: "base" }, ctx), undefined);
  assert.equal(await workflow.handleTurnEnd({ message: { role: "assistant" } }, ctx), undefined);
  assert.equal(await workflow.handleSessionStart({ restored: true }, ctx), undefined);
  assert.equal(await workflow.handleSessionShutdown({ reason: "exit" }, ctx), undefined);
  assert.deepEqual(workflow.getStateSnapshot(), {
    phase: "planning",
    goal: "first run",
    pendingRequestId: undefined,
    awaitingResponse: false,
  });
});
