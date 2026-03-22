import { complete, type Message } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import {
  buildBtwMessages,
  extractTextBlocks,
  extractToolSnippet,
  summarizeToolInput,
  type ToolObservation,
} from "./context-utils";

const BTW_SYSTEM_PROMPT = "";

const MAX_TOOL_OBSERVATIONS = 6;
const MAX_LIVE_ASSISTANT_CHARS = 2400;
const OVERLAY_OPTIONS = {
  anchor: "right-center",
  width: "42%",
  minWidth: 44,
  maxHeight: "70%",
  margin: { top: 1, right: 1, bottom: 1 },
};

interface PendingToolCall {
  toolName: string;
  summary: string;
  timestamp: number;
}

interface RenderTui {
  requestRender(): void;
}

interface RenderTheme {
  fg(color: string, text: string): string;
}

export default function btwExtension(pi: ExtensionAPI): void {
  let liveAssistantText = "";
  let recentToolObservations: ToolObservation[] = [];
  let activeAbortController: AbortController | undefined;
  let overlayOpen = false;
  const pendingToolCalls = new Map<string, PendingToolCall>();

  const resetEphemeralState = () => {
    liveAssistantText = "";
    recentToolObservations = [];
    pendingToolCalls.clear();
    activeAbortController?.abort();
    activeAbortController = undefined;
    overlayOpen = false;
  };

  const pushToolObservation = (observation: ToolObservation) => {
    recentToolObservations.push(observation);
    if (recentToolObservations.length > MAX_TOOL_OBSERVATIONS) {
      recentToolObservations = recentToolObservations.slice(-MAX_TOOL_OBSERVATIONS);
    }
  };

  pi.on("session_start", () => {
    resetEphemeralState();
  });

  pi.on("session_switch", () => {
    resetEphemeralState();
  });

  pi.on("session_fork", () => {
    resetEphemeralState();
  });

  pi.on("session_shutdown", () => {
    resetEphemeralState();
  });

  pi.on("message_start", (event) => {
    if (extractMessageRole(event.message) === "assistant") {
      liveAssistantText = "";
    }
  });

  pi.on("message_update", (event) => {
    if (extractMessageRole(event.message) !== "assistant") {
      return;
    }

    const text = extractTextBlocks(extractMessageContent(event.message));
    if (!text) {
      return;
    }

    liveAssistantText = truncateAssistantText(text);
  });

  pi.on("message_end", (event) => {
    if (extractMessageRole(event.message) !== "assistant") {
      return;
    }

    const text = extractTextBlocks(extractMessageContent(event.message));
    if (!text) {
      return;
    }

    liveAssistantText = truncateAssistantText(text);
  });

  pi.on("agent_end", (event) => {
    const text = extractLatestAssistantTextFromMessages(event.messages ?? []);
    if (!text) {
      return;
    }

    liveAssistantText = truncateAssistantText(text);
  });

  pi.on("tool_call", (event) => {
    const toolCallId = normalizeToolCallId(event.toolCallId);
    if (!toolCallId) {
      return;
    }

    pendingToolCalls.set(toolCallId, {
      toolName: normalizeToolName(event.toolName),
      summary: summarizeToolInput(event.toolName, event.input),
      timestamp: Date.now(),
    });
  });

  pi.on("tool_execution_end", (event) => {
    const toolCallId = normalizeToolCallId(event.toolCallId);
    const pending = toolCallId ? pendingToolCalls.get(toolCallId) : undefined;
    if (toolCallId) {
      pendingToolCalls.delete(toolCallId);
    }

    const toolName = pending?.toolName ?? normalizeToolName(event.toolName);
    const summary = pending?.summary ?? summarizeToolInput(event.toolName, event.args);
    const snippet = shouldCaptureSnippet(toolName) ? extractToolSnippet(event.result) : undefined;

    pushToolObservation({
      toolName,
      summary,
      snippet,
      timestamp: pending?.timestamp ?? Date.now(),
      isError: event.isError === true,
    });
  });

  pi.registerCommand("btw", {
    description: "Ask an ephemeral side question without interrupting the main task",
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/btw requires interactive mode.", "warning");
        return;
      }

      const question = await resolveQuestion(args, ctx);
      if (!question) {
        return;
      }

      if (overlayOpen) {
        ctx.ui.notify("A /btw side panel is already open.", "warning");
        return;
      }

      if (!ctx.model) {
        ctx.ui.notify("No model selected for /btw.", "error");
        return;
      }

      const apiKey = await ctx.modelRegistry.getApiKey(ctx.model);
      if (!apiKey) {
        ctx.ui.notify(`No API key available for ${ctx.model.provider}/${ctx.model.id}.`, "error");
        return;
      }

      const messages = buildBtwMessages({
        question,
        conversationEntries: ctx.sessionManager.getBranch(),
        liveAssistantText,
        toolObservations: recentToolObservations,
        conversationOptions: {
          maxMessages: 12,
          maxMessageChars: 2400,
          maxTotalChars: 14000,
        },
      });

      const abortController = new AbortController();
      activeAbortController = abortController;
      overlayOpen = true;

      try {
        await ctx.ui.custom<void>(
          (tui, theme, _keybindings, done) => {
            const overlay = new BtwOverlay(tui as RenderTui, theme as RenderTheme, {
              question,
              busy: !ctx.isIdle(),
              dismiss: () => done(undefined),
              abort: () => abortController.abort(),
            });

            runSideQuestion(ctx, apiKey, messages, abortController.signal)
              .then((answer) => {
                overlay.setAnswer(answer);
              })
              .catch((error) => {
                if (abortController.signal.aborted) {
                  overlay.setCancelled();
                  return;
                }

                overlay.setError(formatError(error));
              });

            return overlay;
          },
          {
            overlay: true,
            overlayOptions: OVERLAY_OPTIONS,
          },
        );
      } finally {
        activeAbortController?.abort();
        activeAbortController = undefined;
        overlayOpen = false;
      }
    },
  });
}

async function resolveQuestion(
  args: unknown,
  ctx: ExtensionCommandContext,
): Promise<string | undefined> {
  const directQuestion = typeof args === "string" ? args.trim() : "";
  if (directQuestion.length > 0) {
    return directQuestion;
  }

  const editorValue = await ctx.ui.editor("Ask a side question (/btw)", "");
  const question = editorValue?.trim();
  if (!question) {
    return undefined;
  }

  return question;
}

async function runSideQuestion(
  ctx: ExtensionCommandContext,
  apiKey: string,
  messages: Message[],
  signal: AbortSignal,
): Promise<string> {
  const response = await complete(
    ctx.model!,
    {
      systemPrompt: BTW_SYSTEM_PROMPT,
      messages,
    },
    {
      apiKey,
      signal,
      maxTokens: 1200,
    },
  );

  if (response.stopReason === "aborted") {
    throw new Error("aborted");
  }

  const text = response.content
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return text.length > 0 ? text : "I couldn't answer that from the current session context alone.";
}

class BtwOverlay {
  private readonly spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private spinnerIndex = 0;
  private spinnerInterval: ReturnType<typeof setInterval> | null = null;
  private state: "loading" | "done" | "error" | "cancelled" = "loading";
  private answer = "";
  private error = "";
  private closed = false;

  constructor(
    private readonly tui: RenderTui,
    private readonly theme: RenderTheme,
    private readonly options: {
      question: string;
      busy: boolean;
      dismiss: () => void;
      abort: () => void;
    },
  ) {
    this.startSpinner();
  }

  setAnswer(answer: string): void {
    if (this.closed) {
      return;
    }

    this.state = "done";
    this.answer = answer.trim();
    this.stopSpinner();
    this.tui.requestRender();
  }

  setError(error: string): void {
    if (this.closed) {
      return;
    }

    this.state = "error";
    this.error = error;
    this.stopSpinner();
    this.tui.requestRender();
  }

  setCancelled(): void {
    if (this.closed) {
      return;
    }

    this.state = "cancelled";
    this.stopSpinner();
    this.tui.requestRender();
  }

  handleInput(data: string): void {
    if (!isDismissKey(data)) {
      return;
    }

    if (this.state === "loading") {
      this.options.abort();
    }

    this.close();
  }

  render(width: number): string[] {
    const innerWidth = Math.max(18, width - 2);
    const lines: string[] = [];
    const addRow = (content = "") => {
      lines.push(this.row(content, innerWidth));
    };

    lines.push(this.topBorder(innerWidth, " /btw "));
    addRow(this.theme.fg("accent", "Quick side question"));
    addRow(
      this.theme.fg(
        "dim",
        `${this.options.busy ? "main task running" : "main task idle"} • session context only • no tools`,
      ),
    );
    addRow();
    addRow(this.theme.fg("muted", "Question"));
    this.pushWrapped(lines, this.options.question, innerWidth);
    addRow();
    addRow(this.theme.fg("muted", this.answerLabel()));

    if (this.state === "loading") {
      addRow(
        `${this.theme.fg("accent", this.spinnerFrames[this.spinnerIndex]!)} ${this.theme.fg("text", "Answering from the current session context...")}`,
      );
      addRow(this.theme.fg("dim", "The main thread keeps running underneath this panel."));
    } else if (this.state === "done") {
      this.pushWrapped(lines, this.answer || "(No answer returned)", innerWidth);
    } else if (this.state === "cancelled") {
      addRow(this.theme.fg("warning", "Cancelled."));
    } else {
      this.pushWrapped(lines, this.theme.fg("error", this.error), innerWidth);
    }

    addRow();
    addRow(this.theme.fg("dim", this.footerText()));
    lines.push(this.bottomBorder(innerWidth));
    return lines;
  }

  invalidate(): void {}

  dispose(): void {
    this.closed = true;
    this.stopSpinner();
  }

  private close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.stopSpinner();
    this.options.dismiss();
  }

  private answerLabel(): string {
    if (this.state === "loading") {
      return "Side answer";
    }

    if (this.state === "error") {
      return "Side answer failed";
    }

    return "Side answer";
  }

  private footerText(): string {
    if (this.state === "loading") {
      return "Space / Enter / Esc cancel";
    }

    return "Space / Enter / Esc dismiss";
  }

  private startSpinner(): void {
    if (this.spinnerInterval) {
      return;
    }

    this.spinnerInterval = setInterval(() => {
      if (this.closed || this.state !== "loading") {
        return;
      }

      this.spinnerIndex = (this.spinnerIndex + 1) % this.spinnerFrames.length;
      this.tui.requestRender();
    }, 90);
  }

  private stopSpinner(): void {
    if (!this.spinnerInterval) {
      return;
    }

    clearInterval(this.spinnerInterval);
    this.spinnerInterval = null;
  }

  private topBorder(innerWidth: number, title: string): string {
    const titleWidth = Math.min(visibleWidth(title), innerWidth);
    const leftWidth = Math.max(0, Math.floor((innerWidth - titleWidth) / 2));
    const rightWidth = Math.max(0, innerWidth - titleWidth - leftWidth);
    return (
      this.theme.fg("border", `╭${"─".repeat(leftWidth)}`) +
      this.theme.fg("accent", title.slice(0, title.length)) +
      this.theme.fg("border", `${"─".repeat(rightWidth)}╮`)
    );
  }

  private bottomBorder(innerWidth: number): string {
    return this.theme.fg("border", `╰${"─".repeat(innerWidth)}╯`);
  }

  private row(content: string, innerWidth: number): string {
    const padded = content + " ".repeat(Math.max(0, innerWidth - visibleWidth(content)));
    return `${this.theme.fg("border", "│")}${padded}${this.theme.fg("border", "│")}`;
  }

  private pushWrapped(target: string[], text: string, innerWidth: number): void {
    const wrapped = wrapTextWithAnsi(text, Math.max(10, innerWidth));
    for (const line of wrapped) {
      target.push(this.row(truncateToWidth(line, innerWidth), innerWidth));
    }
  }
}

function extractLatestAssistantTextFromMessages(messages: unknown[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const text = extractAssistantText(messages[index]);
    if (text) {
      return text;
    }
  }

  return "";
}

function extractAssistantText(message: unknown): string {
  if (extractMessageRole(message) !== "assistant") {
    return "";
  }

  return extractTextBlocks(extractMessageContent(message));
}

function extractMessageRole(message: unknown): string | undefined {
  if (typeof message !== "object" || message === null) {
    return undefined;
  }

  const role = (message as { role?: unknown }).role;
  return typeof role === "string" ? role : undefined;
}

function extractMessageContent(message: unknown): unknown {
  if (typeof message !== "object" || message === null) {
    return undefined;
  }

  return (message as { content?: unknown }).content;
}

function shouldCaptureSnippet(toolName: string): boolean {
  return ["read", "bash", "grep", "find", "ls"].includes(toolName);
}

function truncateAssistantText(text: string): string {
  if (text.length <= MAX_LIVE_ASSISTANT_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_LIVE_ASSISTANT_CHARS - 1)}…`;
}

function normalizeToolName(toolName: unknown): string {
  return typeof toolName === "string" ? toolName.trim().toLowerCase() : "tool";
}

function normalizeToolCallId(toolCallId: unknown): string | undefined {
  if (typeof toolCallId !== "string") {
    return undefined;
  }

  const normalized = toolCallId.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function isDismissKey(data: string): boolean {
  return matchesKey(data, "enter") || matchesKey(data, "escape") || matchesKey(data, "space");
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error ?? "Unknown /btw error");
}
