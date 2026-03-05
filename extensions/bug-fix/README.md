# bug-fix extension

## Runtime modules

- `index.ts`: extension bootstrap and API registration only.
- `workflow.ts`: phase state machine and lifecycle rules.
- `prompting.ts`: prompt file loading and prompt rendering.
- `messages.ts`: input/output parsing helpers.

## Lifecycle guarantees

- Only one active run at a time.
- Analysis phases block `Edit` and `Write` tools.
- Empty assistant output retries are bounded (`MAX_EMPTY_OUTPUT_RETRIES`).
- Refinement attempts are bounded (`MAX_REFINEMENT_ATTEMPTS`).
