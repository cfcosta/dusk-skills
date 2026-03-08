export type ThemeActivationResult = { success: true } | { success: false; error?: string };

export interface ExtensionUI {
  notify(message: string, level: "info" | "warning" | "error"): void;
  setStatus(id: string, status: string | undefined): void;
  setWidget(id: string, widget: string | undefined): void;
  select(title: string, options: string[]): Promise<string | undefined>;
  editor(label: string, initialValue: string): Promise<string | undefined>;
  setTheme(themeName: string): ThemeActivationResult;
}

export interface ExtensionContext {
  ui: ExtensionUI;
}

interface ExtensionEventContext {
  tool_call: ExtensionContext | undefined;
  agent_end: ExtensionContext | undefined;
  session_start: ExtensionContext;
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
  on<EventName extends keyof ExtensionEventContext>(
    event: EventName,
    handler: (event: unknown, ctx: ExtensionEventContext[EventName]) => unknown,
  ): void;
}
