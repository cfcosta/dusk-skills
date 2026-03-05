import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@anthropic-ai/claude-code";
import { loadPrompts } from "./prompting";
import { OwaspWorkflow } from "./workflow";

export default function owaspFix(api: ExtensionAPI): void {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const promptDirectory = path.resolve(moduleDirectory, "prompts");
  const workflow = new OwaspWorkflow(api, () => loadPrompts(promptDirectory));

  api.registerCommand("owasp-fix", {
    description: "Run the OWASP Top 10 adversarial security remediation workflow (4 phases)",
    handler: workflow.handleCommand.bind(workflow),
  });

  api.on("tool_call", workflow.handleToolCall.bind(workflow));
  api.on("agent_end", workflow.handleAgentEnd.bind(workflow));
}
