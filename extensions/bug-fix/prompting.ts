import * as fs from "node:fs";
import * as path from "node:path";

export const PROMPT_FILE_NAMES = {
  finder: "finder.md",
  skeptic: "skeptic.md",
  arbiter: "arbiter.md",
  fixer: "fixer.md",
} as const;

export type PromptKey = keyof typeof PROMPT_FILE_NAMES;
export type PromptBundle = Record<PromptKey, string>;

export interface WorkflowReports {
  finder?: string;
  skeptic?: string;
  arbiter?: string;
}

export class PromptLoadError extends Error {
  constructor(
    public readonly code: "PROMPT_READ_FAILED",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PromptLoadError";
  }
}

export interface PromptLoadResult {
  prompts?: PromptBundle;
  error?: PromptLoadError;
}

export function loadPrompts(promptDirectory: string): PromptLoadResult {
  try {
    const prompts = {
      finder: readPromptFile(promptDirectory, PROMPT_FILE_NAMES.finder),
      skeptic: readPromptFile(promptDirectory, PROMPT_FILE_NAMES.skeptic),
      arbiter: readPromptFile(promptDirectory, PROMPT_FILE_NAMES.arbiter),
      fixer: readPromptFile(promptDirectory, PROMPT_FILE_NAMES.fixer),
    };

    return { prompts };
  } catch (error) {
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : "unknown I/O error";
    return {
      error: new PromptLoadError(
        "PROMPT_READ_FAILED",
        `failed to load prompt bundle from '${promptDirectory}': ${reason}`,
        { cause: error instanceof Error ? error : undefined },
      ),
    };
  }
}

export function buildPrompt(
  phase: "finder" | "skeptic" | "arbiter" | "fixer",
  prompts: PromptBundle,
  reports: WorkflowReports,
  scope?: string,
  refinement?: string,
): string {
  const sections: string[] = [];

  if (phase === "finder") {
    sections.push(prompts.finder);
    if (scope) {
      sections.push(`Focus on: ${scope}`);
    }
  }

  if (phase === "skeptic") {
    sections.push(prompts.skeptic, "## Bug Report from Phase 1", reports.finder ?? "");
  }

  if (phase === "arbiter") {
    sections.push(
      prompts.arbiter,
      "## Bug Report (Phase 1)",
      reports.finder ?? "",
      "## Skeptic Review (Phase 2)",
      reports.skeptic ?? "",
    );

    if (refinement?.trim()) {
      sections.push(
        "## Existing Arbitration",
        reports.arbiter ?? "",
        "## Refinement Request",
        refinement.trim(),
        "Please produce a fully revised arbitration report.",
      );
    }
  }

  if (phase === "fixer") {
    sections.push(prompts.fixer, "## Verified Bug List", reports.arbiter ?? "");
  }

  return sections.join("\n\n");
}

function readPromptFile(promptDirectory: string, fileName: string): string {
  const filePath = path.join(promptDirectory, fileName);
  const content = fs.readFileSync(filePath, "utf-8").trim();

  if (!content) {
    throw new Error(`prompt file '${filePath}' is empty`);
  }

  return content;
}
