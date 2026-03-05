---
name: desloppify
description: >
  Codebase health scanner and technical debt tracker. Use when the user asks
  about code quality, technical debt, dead code, large files, god classes,
  duplicate functions, code smells, naming issues, import cycles, or coupling
  problems. Also use when asked for a health score, what to fix next, or to
  create a cleanup plan. Supports 28 languages.
allowed-tools: Bash(##DESLOPPIFY## *)
---

# Desloppify

## Desloppify path (required)

This skill expects `desloppify` to be available at a fixed path placeholder:

```bash
export DESLOPPIFY="##DESLOPPIFY##"
```

- `##DESLOPPIFY##` must be replaced during installation/deployment.
- Always run commands through `$DESLOPPIFY`.

## Prerequisite check (required)

Before proposing any workflow, verify the configured binary exists and is executable:

```bash
export DESLOPPIFY="##DESLOPPIFY##"
[ -x "$DESLOPPIFY" ]
```

If it is not executable, pause and ask the user to install/configure desloppify at the configured path, then retry.

## 1. Your Job

Maximise the **strict score** honestly. Your main cycle: **scan -> plan -> execute -> rescan**. Follow the scan output's **INSTRUCTIONS FOR AGENTS** -- don't substitute your own analysis.

**Don't be lazy.** Do large refactors and small detailed fixes with equal energy. If it takes touching 20 files, touch 20 files. If it's a one-line change, make it. No task is too big or too small -- fix things properly, not minimally.

## 2. The Workflow

Three phases, repeated as a cycle.

### Phase 1: Scan and review -- understand the codebase

```bash
$DESLOPPIFY scan --path .
$DESLOPPIFY status
```

The scan will tell you if subjective dimensions need review. Follow its instructions. To trigger a review manually:

```bash
$DESLOPPIFY review --prepare
```

### Phase 2: Plan -- decide what to work on

After reviews, triage stages and plan creation appear as queue items in `next`. Complete them in order:

```bash
$DESLOPPIFY next
$DESLOPPIFY plan triage --stage observe --report "themes and root causes..."
$DESLOPPIFY plan triage --stage reflect --report "comparison against completed work..."
$DESLOPPIFY plan triage --stage organize --report "summary of priorities..."
$DESLOPPIFY plan triage --complete --strategy "execution plan..."
```

Then shape the queue:

```bash
$DESLOPPIFY plan
$DESLOPPIFY plan reorder <pat> top
$DESLOPPIFY plan cluster create <name>
$DESLOPPIFY plan focus <cluster>
$DESLOPPIFY plan skip <pat>
```

### Phase 3: Execute -- grind the queue to completion

Trust the plan and execute. Don't rescan mid-queue -- finish the queue first.

**The loop:**

```
1. $DESLOPPIFY next              <- what to fix next
2. Fix the issue in code
3. Resolve it (next shows you the exact command including required attestation)
4. Commit the fix
5. Repeat until the queue is empty
```

Score may temporarily drop after fixes -- cascade effects are normal, keep going.
If `next` suggests an auto-fixer, run `$DESLOPPIFY autofix <fixer> --dry-run` to preview, then apply.

**When the queue is clear, go back to Phase 1.**

### Other useful commands

```bash
$DESLOPPIFY next --count 5
$DESLOPPIFY next --cluster <name>
$DESLOPPIFY show <pattern>
$DESLOPPIFY show --status open
$DESLOPPIFY plan skip --permanent "<id>" --note "reason" --attest "..."
$DESLOPPIFY exclude <path>
$DESLOPPIFY config show
$DESLOPPIFY scan --path . --reset-subjective
```

## 3. Reference

### How scoring works

Overall score = **40% mechanical** + **60% subjective**.

- **Mechanical (40%)**: auto-detected issues -- duplication, dead code, smells, unused imports, security. Fixed by changing code and rescanning.
- **Subjective (60%)**: design quality review -- naming, error handling, abstractions, clarity. Starts at **0%** until reviewed.
- **Strict score** is the north star: wontfix items count as open.

### Key concepts

- **Tiers**: T1 auto-fix -> T2 quick manual -> T3 judgment call -> T4 major refactor.
- **Auto-clusters**: related findings are auto-grouped in `next`. Drill in with `next --cluster <name>`.
- **Zones**: production/script (scored), test/config/generated/vendor (not scored). Fix with `zone set`.
- Score can temporarily drop after fixes (cascade effects are normal).

## Guardrails

- Before scanning, check for directories that should be excluded (vendor, build output, generated code, worktrees) and exclude obvious ones with `$DESLOPPIFY exclude <path>`.
- Follow the scan output's agent instructions -- don't substitute your own analysis.
- Don't rescan mid-queue unless explicitly asked. Finish the queue first.
