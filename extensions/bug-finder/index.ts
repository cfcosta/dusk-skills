import * as path from "node:path";
import type { ExtensionAPI } from "@anthropic-ai/claude-code";
import { loadPrompts } from "./prompting";
import { BugFinderWorkflow } from "./workflow";

/**
 * Public extension entrypoint. Prompt initialization errors are handled gracefully:
 * the command remains registered and reports a clear startup error instead of throwing.
 */
export default function bugFix(api: ExtensionAPI): void {
  const promptDirectory = path.resolve(__dirname, "prompts");
  const workflow = new BugFinderWorkflow(api, () => loadPrompts(promptDirectory));

  api.registerCommand("bug-fix", {
    description: "Run the adversarial bug-finding workflow (4 phases)",
    handler: workflow.handleCommand.bind(workflow),
  });

  api.on("tool_call", workflow.handleToolCall.bind(workflow));
  api.on("agent_end", workflow.handleAgentEnd.bind(workflow));
}
