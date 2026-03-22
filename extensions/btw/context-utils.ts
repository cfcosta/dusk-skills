import type { Message } from "@mariozechner/pi-ai";

export interface ToolObservation {
  toolName: string;
  summary: string;
  snippet?: string;
  timestamp: number;
  isError?: boolean;
}

export interface ConversationExcerptOptions {
  maxMessages?: number;
  maxMessageChars?: number;
  maxTotalChars?: number;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  text: string;
}

export interface BtwMessageContext {
  question: string;
  conversationEntries: unknown[];
  liveAssistantText?: string;
  toolObservations?: ToolObservation[];
  conversationOptions?: ConversationExcerptOptions;
}

const DEFAULT_MAX_MESSAGES = 6;
const DEFAULT_MAX_MESSAGE_CHARS = 1400;
const DEFAULT_MAX_TOTAL_CHARS = 7000;
const DEFAULT_MAX_TOOL_ITEMS = 4;
const DEFAULT_MAX_TOOL_SNIPPET_CHARS = 900;

export function truncateText(input: string, maxChars: number): string {
  if (maxChars <= 0) {
    return "";
  }

  if (input.length <= maxChars) {
    return input;
  }

  if (maxChars === 1) {
    return "…";
  }

  return `${input.slice(0, maxChars - 1)}…`;
}

export function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

export function extractTextBlocks(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  const text = content
    .filter((part): part is { type?: unknown; text?: unknown } => {
      return typeof part === "object" && part !== null;
    })
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();

  return text;
}

export function buildConversationMessages(
  entries: unknown[],
  options: ConversationExcerptOptions = {},
): ConversationMessage[] {
  const maxMessages = options.maxMessages ?? DEFAULT_MAX_MESSAGES;
  const maxMessageChars = options.maxMessageChars ?? DEFAULT_MAX_MESSAGE_CHARS;
  const maxTotalChars = options.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS;

  const collected: ConversationMessage[] = [];
  let totalChars = 0;

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const typedEntry = entry as {
      type?: unknown;
      message?: { role?: unknown; content?: unknown };
    };

    if (typedEntry.type !== "message" || !typedEntry.message) {
      continue;
    }

    const role = typedEntry.message.role;
    if (role !== "user" && role !== "assistant") {
      continue;
    }

    const text = extractTextBlocks(typedEntry.message.content);
    if (!text) {
      continue;
    }

    const normalizedText = truncateText(text, maxMessageChars);
    const nextTotal = totalChars + normalizedText.length;
    if (collected.length > 0 && nextTotal > maxTotalChars) {
      break;
    }

    collected.push({
      role,
      text: normalizedText,
    });
    totalChars = nextTotal;

    if (collected.length >= maxMessages) {
      break;
    }
  }

  return collected.reverse();
}

export function buildConversationExcerpt(
  entries: unknown[],
  options: ConversationExcerptOptions = {},
): string {
  return buildConversationMessages(entries, options)
    .map((item) => `${item.role === "user" ? "User" : "Assistant"}:\n${item.text}`)
    .join("\n\n")
    .trim();
}

export function buildClaudeCodeSideQuestionPrompt(question: string): string {
  const normalizedQuestion = normalizeWhitespace(question);
  return `<system-reminder>This is a side question from the user. You must answer this question directly in a single response.\n${normalizedQuestion}`;
}

export function buildBtwMessages(context: BtwMessageContext): Message[] {
  const conversationMessages = buildConversationMessages(
    context.conversationEntries,
    context.conversationOptions,
  );

  const messages: Message[] = conversationMessages.map((message, index) => ({
    role: message.role,
    content: [{ type: "text", text: message.text }],
    timestamp: Date.now() + index,
  }));

  const liveAssistantText = normalizeWhitespace(context.liveAssistantText ?? "");
  const lastAssistantText = [...conversationMessages]
    .reverse()
    .find((message) => message.role === "assistant")?.text;

  if (liveAssistantText && liveAssistantText !== lastAssistantText) {
    messages.push({
      role: "assistant",
      content: [{ type: "text", text: liveAssistantText }],
      timestamp: Date.now() + messages.length,
    });
  }

  const toolContext = formatToolContextReminder(context.toolObservations ?? []);
  if (toolContext) {
    messages.push({
      role: "user",
      content: [{ type: "text", text: toolContext }],
      timestamp: Date.now() + messages.length,
    });
  }

  messages.push({
    role: "user",
    content: [{ type: "text", text: buildClaudeCodeSideQuestionPrompt(context.question) }],
    timestamp: Date.now() + messages.length,
  });

  return messages;
}

export function summarizeToolInput(toolName: string | undefined, input: unknown): string {
  const normalizedToolName = (toolName ?? "tool").trim().toLowerCase() || "tool";

  if (typeof input !== "object" || input === null) {
    return normalizedToolName;
  }

  const typedInput = input as Record<string, unknown>;
  const path = normalizeToolPath(typedInput.path);
  const command = typeof typedInput.command === "string" ? typedInput.command.trim() : undefined;
  const pattern = typeof typedInput.pattern === "string" ? typedInput.pattern.trim() : undefined;

  if (normalizedToolName === "read" && path) {
    return `read ${path}`;
  }

  if (normalizedToolName === "write" && path) {
    return `write ${path}`;
  }

  if (normalizedToolName === "edit" && path) {
    return `edit ${path}`;
  }

  if (normalizedToolName === "bash" && command) {
    return `bash ${truncateText(command.replace(/\s+/g, " "), 120)}`;
  }

  if (normalizedToolName === "grep") {
    const parts = [normalizedToolName];
    if (pattern) {
      parts.push(`pattern=${truncateText(pattern, 48)}`);
    }
    if (path) {
      parts.push(`path=${path}`);
    }
    return parts.join(" ");
  }

  if (path) {
    return `${normalizedToolName} ${path}`;
  }

  if (command) {
    return `${normalizedToolName} ${truncateText(command.replace(/\s+/g, " "), 80)}`;
  }

  const compactJson = truncateText(JSON.stringify(compactValue(typedInput)), 120);
  return compactJson.length > 0 ? `${normalizedToolName} ${compactJson}` : normalizedToolName;
}

export function extractToolSnippet(
  result: unknown,
  maxChars = DEFAULT_MAX_TOOL_SNIPPET_CHARS,
): string | undefined {
  const textFromResult = extractTextFromToolResult(result);
  if (textFromResult) {
    return truncateText(textFromResult, maxChars);
  }

  const detailsText = extractDetailsText(result);
  if (detailsText) {
    return truncateText(detailsText, maxChars);
  }

  return undefined;
}

export function formatToolObservations(
  observations: ToolObservation[],
  maxItems = DEFAULT_MAX_TOOL_ITEMS,
  maxSnippetChars = DEFAULT_MAX_TOOL_SNIPPET_CHARS,
): string {
  const selected = observations.slice(-maxItems);
  return selected
    .map((observation) => {
      const bullet = observation.isError ? "- ERROR" : "-";
      const lines = [`${bullet} ${observation.summary}`];
      if (observation.snippet) {
        const snippet = truncateText(observation.snippet, maxSnippetChars)
          .split(/\r?\n/)
          .map((line) => line.trimEnd())
          .join("\n    ");
        lines.push(`    snippet: ${snippet}`);
      }
      return lines.join("\n");
    })
    .join("\n");
}

function formatToolContextReminder(observations: ToolObservation[]): string {
  if (observations.length === 0) {
    return "";
  }

  return [
    "<system-reminder>Additional already-observed tool context from the main thread. These tools have already run; treat this as existing session context, not a request to use tools.",
    formatToolObservations(observations, DEFAULT_MAX_TOOL_ITEMS, DEFAULT_MAX_TOOL_SNIPPET_CHARS),
  ]
    .join("\n\n")
    .trim();
}

function normalizeToolPath(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.replace(/^@/, "").trim();
  return normalized.length > 0 ? normalized : undefined;
}

function compactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 4).map((entry) => compactValue(entry));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value).slice(0, 6)) {
    if (typeof entry === "string") {
      result[key] = truncateText(entry, 48);
      continue;
    }

    if (
      typeof entry === "number" ||
      typeof entry === "boolean" ||
      entry === null ||
      Array.isArray(entry) ||
      typeof entry === "object"
    ) {
      result[key] = compactValue(entry);
    }
  }

  return result;
}

function extractTextFromToolResult(result: unknown): string {
  if (typeof result !== "object" || result === null) {
    return "";
  }

  const typedResult = result as { content?: unknown };
  return extractTextBlocks(typedResult.content);
}

function extractDetailsText(result: unknown): string {
  if (typeof result !== "object" || result === null) {
    return "";
  }

  const details = (result as { details?: unknown }).details;
  if (!details || typeof details !== "object") {
    return "";
  }

  try {
    return JSON.stringify(compactValue(details), null, 2);
  } catch {
    return "";
  }
}
