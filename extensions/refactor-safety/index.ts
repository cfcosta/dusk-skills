import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "../../packages/workflow-core/src/index";
import { loadPrompts } from "./prompting";
import { RefactorSafetyWorkflow } from "./workflow";

export default function refactorSafety(api: ExtensionAPI): void {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const promptDirectory = path.resolve(moduleDirectory, "prompts");
  const workflow = new RefactorSafetyWorkflow(api, () => loadPrompts(promptDirectory));

  api.registerCommand("refactor-safety", {
    description: "Run the safe refactoring workflow (4 phases)",
    handler: workflow.handleCommand.bind(workflow),
  });

  api.on("tool_call", workflow.handleToolCall.bind(workflow));
  api.on("agent_end", workflow.handleAgentEnd.bind(workflow));
}
