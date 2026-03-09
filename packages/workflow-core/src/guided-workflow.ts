import type {
  AgentEndEvent,
  BeforeAgentStartEvent,
  ExtensionAPI,
  ExtensionContext,
  SessionShutdownEvent,
  SessionStartEvent,
  ToolCallEvent,
  TurnEndEvent,
} from "./extension-api";
import type { GuidedWorkflowController } from "./register-guided-workflow-extension";

type GuidedWorkflowResultKind = "ok" | "blocked" | "recoverable_error";

export interface GuidedWorkflowResult {
  kind: GuidedWorkflowResultKind;
  reason?: string;
}

export type GuidedWorkflowPhase = "idle" | "planning" | "approval" | "executing";

export interface GuidedWorkflowState {
  phase: GuidedWorkflowPhase;
  goal?: string;
  pendingRequestId?: string;
  awaitingResponse: boolean;
}

interface GuidedWorkflowText {
  alreadyRunning: string;
}

export interface GuidedWorkflowOptions {
  id: string;
  parseGoalArg?: (args: unknown) => string | undefined;
  text: GuidedWorkflowText;
}

export class GuidedWorkflow implements GuidedWorkflowController {
  private state: GuidedWorkflowState = this.createIdleState();

  constructor(
    private readonly _api: ExtensionAPI,
    private readonly options: GuidedWorkflowOptions,
  ) {}

  getStateSnapshot(): GuidedWorkflowState {
    return { ...this.state };
  }

  async handleCommand(args: unknown, ctx: ExtensionContext): Promise<GuidedWorkflowResult> {
    if (this.state.phase !== "idle") {
      ctx.ui.notify(this.options.text.alreadyRunning, "warning");
      return { kind: "blocked", reason: "already_running" };
    }

    this.state = {
      ...this.createIdleState(),
      phase: "planning",
      goal: this.options.parseGoalArg?.(args),
    };

    return { kind: "ok" };
  }

  async handleToolCall(_event: ToolCallEvent, _ctx: ExtensionContext): Promise<void> {
    return undefined;
  }

  async handleAgentEnd(_event: AgentEndEvent, _ctx: ExtensionContext): Promise<void> {
    return undefined;
  }

  handleBeforeAgentStart(_event: BeforeAgentStartEvent, _ctx: ExtensionContext): void {
    return undefined;
  }

  async handleTurnEnd(_event: TurnEndEvent, _ctx: ExtensionContext): Promise<void> {
    return undefined;
  }

  async handleSessionStart(_event: SessionStartEvent, _ctx: ExtensionContext): Promise<void> {
    return undefined;
  }

  async handleSessionShutdown(
    _event: SessionShutdownEvent,
    _ctx: ExtensionContext,
  ): Promise<void> {
    return undefined;
  }

  private createIdleState(): GuidedWorkflowState {
    return {
      phase: "idle",
      goal: undefined,
      pendingRequestId: undefined,
      awaitingResponse: false,
    };
  }
}
