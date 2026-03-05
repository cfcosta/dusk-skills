interface TextBlock {
  type?: unknown;
  text?: unknown;
}

interface TextContentBlock extends TextBlock {
  type: "text";
  text: string;
}

interface MessageLike {
  role?: unknown;
  content?: unknown;
}

export function parseScopeArg(args: unknown): string | undefined {
  if (typeof args !== "string") {
    return undefined;
  }

  const scope = args.trim();
  return scope.length > 0 ? scope : undefined;
}

export function extractAssistantText(messages: unknown[]): string | undefined {
  const typedMessages = messages.filter((message): message is MessageLike => {
    return typeof message === "object" && message !== null;
  });

  const lastAssistantMessage = [...typedMessages]
    .reverse()
    .find((message) => message.role === "assistant");

  if (!lastAssistantMessage || !Array.isArray(lastAssistantMessage.content)) {
    return undefined;
  }

  const text = lastAssistantMessage.content
    .filter((block): block is TextBlock => typeof block === "object" && block !== null)
    .filter(isTextContentBlock)
    .map((block) => block.text)
    .join("\n")
    .trim();

  return text.length > 0 ? text : undefined;
}

function isTextContentBlock(block: TextBlock): block is TextContentBlock {
  return block.type === "text" && typeof block.text === "string";
}
