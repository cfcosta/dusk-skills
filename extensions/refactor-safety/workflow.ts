import type { ExtensionAPI } from "@anthropic-ai/claude-code";
import { PhaseWorkflow, type PromptSnapshot } from "../../packages/workflow-core/src/index";
import { parseScopeArg } from "./messages";
import { buildPrompt, type PromptBundle, type PromptLoadResult } from "./prompting";

const ANALYSIS_PHASES = ["mapper", "skeptic", "arbiter"] as const;
const EXECUTION_PHASE = "executor" as const;

const PHASE_LABELS: Record<(typeof ANALYSIS_PHASES)[number] | typeof EXECUTION_PHASE, string> = {
  mapper: "Mapping refactor candidates...",
  skeptic: "Reviewing refactor safety...",
  arbiter: "Arbitrating refactor plan...",
  executor: "Executing refactors...",
};

export class RefactorSafetyWorkflow extends PhaseWorkflow<PromptBundle> {
  constructor(api: ExtensionAPI, promptProvider: () => PromptLoadResult) {
    super(api, {
      id: "refactor-safety",
      analysisPhases: ANALYSIS_PHASES,
      executionPhase: EXECUTION_PHASE,
      phaseLabels: PHASE_LABELS,
      promptProvider: () => mapPromptResult(promptProvider()),
      parseScopeArg,
      buildPrompt: ({ phase, prompts, reports, scope, refinement }) =>
        buildPrompt({
          phase: phase as (typeof ANALYSIS_PHASES)[number] | typeof EXECUTION_PHASE,
          prompts,
          reports: {
            mapper: reports.mapper,
            skeptic: reports.skeptic,
            arbiter: reports.arbiter,
          },
          scope,
          refinement,
        }),
      text: {
        unavailable: (error) =>
          `Refactor safety is unavailable: ${error?.message ?? "prompt initialization failed."}`,
        alreadyRunning:
          "Refactor safety is already running. Finish or cancel the current run first.",
        analysisWriteBlocked: "Refactor safety analysis phase: writes are disabled",
        complete: "Refactor safety workflow complete!",
        cancelled: "Refactor safety cancelled.",
        selectTitle: "Refactor Safety - Analysis Complete",
        executeOption: "Execute refactors (TDD workflow)",
        refineOption: "Refine the analysis",
        cancelOption: "Cancel",
        refineEditorLabel: "Refine analysis:",
        sendFailed: (phase) =>
          `Refactor safety stopped: failed to send prompt for phase '${phase}'.`,
        missingOutputRetry: (phase, retry, maxRetries) =>
          `No assistant output captured for phase '${phase}'. Retrying (${retry}/${maxRetries}).`,
        missingOutputStopped: (attempts) =>
          `Refactor safety stopped: no assistant output captured after ${attempts} attempts.`,
      },
      maxEmptyOutputRetries: 2,
      maxRefinementAttempts: 3,
    });
  }
}

function mapPromptResult(result: PromptLoadResult): PromptSnapshot<PromptBundle> {
  if (result.ok) {
    return { prompts: result.prompts };
  }

  return { error: result.error };
}
