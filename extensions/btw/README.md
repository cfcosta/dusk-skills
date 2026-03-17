# btw extension

Ephemeral side-question overlay for `duskpi`.

## What it does

Adds `/btw <question>` so you can ask a quick side question while the main agent keeps working.

Behavior:

- opens a floating overlay instead of injecting a visible conversation turn
- uses the current session context, recent assistant output, and recent observed tool activity
- does **not** grant the side question any tool access
- keeps the main thread running underneath the overlay
- dismisses with `Space`, `Enter`, or `Esc`

## Usage

```txt
/btw Which method owns the hidden follow-up dispatch?
/btw Is tool restoration handled in workflow-core or only in extensions/plan?
```

You can also run bare `/btw` and type the question into the editor prompt.

## Design notes

This is an extension-only approximation of Claude Code's `/btw` behavior.

What it does well:

- non-interrupting side answers
- overlay-first UI
- no transcript pollution
- context built from the active session and recent observed tool activity

Current limitations:

- no shared provider prompt-cache reuse with the main turn
- no fresh tool access for the side answer
- one overlay at a time
- context is only as good as the current session plus captured tool/result snippets
