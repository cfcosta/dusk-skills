export interface ExtensionUI {
  notify(message: string, level: "info" | "warning" | "error"): void;
  setStatus(id: string, status: string | undefined): void;
  setWidget(id: string, widget: string | undefined): void;
  select(title: string, options: string[]): Promise<string | undefined>;
  editor(label: string, initialValue: string): Promise<string | undefined>;
}

export interface ExtensionContext {
  ui: ExtensionUI;
}

export interface ExtensionAPI {
  sendUserMessage(message: string): void;
  registerCommand(
    name: string,
    command: {
      description: string;
      handler: (args: unknown, ctx: ExtensionContext) => unknown;
    },
  ): void;
  on(
    event: "tool_call" | "agent_end",
    handler: (event: unknown, ctx?: ExtensionContext) => unknown,
  ): void;
}
