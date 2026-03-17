# plan architecture notes

This file tracks the repo-local architecture of the vendored `plan` extension inside `duskpi`.

## Current shape

- `src/index.ts` is only the bootstrap layer. It registers `plan` through `registerGuidedWorkflowExtension(...)` and wires `/todos` to the workflow instance.
- `src/workflow.ts` defines `PiPlanWorkflow`, a thin `GuidedWorkflow` consumer with `plan`-specific policy and UI hooks.
- Shared guided state in `packages/workflow-core` owns:
  - correlated planning requests
  - hidden critique and revision orchestration
  - approval action dispatch
  - execution item tracking and `[DONE:n]` syncing
  - `/todos` data sources
  - status and widget lifecycle cleanup on session boundaries
- Local `plan` code still owns:
  - plan-mode tool switching and restore behavior
  - plan-specific system prompts and critique text
  - the inline approval action UI
  - user-facing notifications and command text

## User-visible behavior

- `/plan` keeps planning read-only until approval.
- Every draft plan gets a hidden critique pass before the approval UI appears.
- Approved execution runs one step per turn and expects one atomic `jj` commit per step.
- `/todos`, status text, and widget output all reflect the shared guided execution state.

## Shared-workflow boundary

- `PhaseWorkflow` remains the shared runtime for `bug-fix`, `refactor`, `test-audit`, and `owasp-fix`.
- `GuidedWorkflow` exists alongside it for planning flows that need hidden turns, approval state, execution tracking, and session lifecycle hooks.
- This vendored copy is repo-local and private; upstream publishing docs do not apply here.

## Validation

```bash
cd extensions/plan && bun install && bun run check
cd packages/workflow-core && bun install && bun run check
```
