import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBtwMessages,
  buildClaudeCodeSideQuestionPrompt,
  buildConversationExcerpt,
  extractTextBlocks,
  extractToolSnippet,
  formatToolObservations,
  summarizeToolInput,
  truncateText,
  type ToolObservation,
} from "./context-utils";

test("extractTextBlocks joins text array content", () => {
  const text = extractTextBlocks([
    { type: "text", text: "first" },
    { type: "toolCall", name: "read" },
    { type: "text", text: "second" },
  ]);

  assert.equal(text, "first\nsecond");
});

test("buildConversationExcerpt keeps the latest user and assistant messages", () => {
  const excerpt = buildConversationExcerpt([
    { type: "message", message: { role: "user", content: [{ type: "text", text: "first" }] } },
    {
      type: "message",
      message: { role: "assistant", content: [{ type: "text", text: "first reply" }] },
    },
    {
      type: "message",
      message: { role: "toolResult", content: [{ type: "text", text: "ignored" }] },
    },
    {
      type: "message",
      message: { role: "user", content: [{ type: "text", text: "latest question" }] },
    },
    {
      type: "message",
      message: { role: "assistant", content: [{ type: "text", text: "latest answer" }] },
    },
  ]);

  assert.equal(
    excerpt,
    "User:\nfirst\n\nAssistant:\nfirst reply\n\nUser:\nlatest question\n\nAssistant:\nlatest answer",
  );
});

test("buildConversationExcerpt enforces a last-message budget", () => {
  const excerpt = buildConversationExcerpt(
    [
      {
        type: "message",
        message: { role: "user", content: [{ type: "text", text: "old question" }] },
      },
      {
        type: "message",
        message: { role: "assistant", content: [{ type: "text", text: "old answer" }] },
      },
      {
        type: "message",
        message: { role: "user", content: [{ type: "text", text: "new question" }] },
      },
      {
        type: "message",
        message: { role: "assistant", content: [{ type: "text", text: "new answer" }] },
      },
    ],
    { maxMessages: 2 },
  );

  assert.equal(excerpt, "User:\nnew question\n\nAssistant:\nnew answer");
});

test("buildClaudeCodeSideQuestionPrompt matches Claude Code's side-question reminder", () => {
  const prompt = buildClaudeCodeSideQuestionPrompt("Which method owns hidden follow-up dispatch?");

  assert.equal(
    prompt,
    "<system-reminder>This is a side question from the user. You must answer this question directly in a single response.\nWhich method owns hidden follow-up dispatch?",
  );
});

test("buildBtwMessages appends the side-question reminder after recent context", () => {
  const messages = buildBtwMessages({
    question: "Which method owns hidden follow-up dispatch?",
    conversationEntries: [
      {
        type: "message",
        message: { role: "user", content: [{ type: "text", text: "Explain /plan" }] },
      },
      {
        type: "message",
        message: { role: "assistant", content: [{ type: "text", text: "It stages approval." }] },
      },
    ],
    liveAssistantText: "Still reviewing follow-up dispatch.",
    toolObservations: [
      {
        toolName: "read",
        summary: "read packages/workflow-core/src/guided-workflow.ts",
        snippet: "private sendHiddenFollowUp(...)",
        timestamp: Date.now(),
      },
    ],
  });

  assert.equal(messages.at(-1)?.role, "user");
  assert.match(
    (messages.at(-1)?.content?.[0] as { type: string; text: string }).text,
    /^<system-reminder>This is a side question from the user\./,
  );
  assert.equal(messages.at(-2)?.role, "user");
  assert.match(
    (messages.at(-2)?.content?.[0] as { type: string; text: string }).text,
    /Additional already-observed tool context/,
  );
  assert.equal(messages.at(-3)?.role, "assistant");
  assert.equal(
    (messages.at(-3)?.content?.[0] as { type: string; text: string }).text,
    "Still reviewing follow-up dispatch.",
  );
});

test("summarizeToolInput produces focused summaries for read and bash", () => {
  assert.equal(summarizeToolInput("read", { path: "@src/index.ts" }), "read src/index.ts");
  assert.match(summarizeToolInput("bash", { command: "git status --short" }), /^bash git status/);
});

test("extractToolSnippet prefers text content and truncates it", () => {
  const snippet = extractToolSnippet(
    {
      content: [{ type: "text", text: "0123456789abcdefghij" }],
      details: { ignored: true },
    },
    12,
  );

  assert.equal(snippet, "0123456789a…");
});

test("formatToolObservations renders summaries and snippets", () => {
  const observations: ToolObservation[] = [
    {
      toolName: "read",
      summary: "read src/index.ts",
      snippet: "export default 42;",
      timestamp: Date.now(),
    },
  ];

  const formatted = formatToolObservations(observations);
  assert.match(formatted, /read src\/index\.ts/);
  assert.match(formatted, /snippet: export default 42;/);
});

test("truncateText adds an ellipsis when over budget", () => {
  assert.equal(truncateText("abcdef", 4), "abc…");
});
