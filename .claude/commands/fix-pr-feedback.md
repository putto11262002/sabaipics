---
description: Resolve unresolved PR review feedback
allowed-tools: [Bash, Read, Edit, Write, Grep, Glob, Task, mcp__tavily__search, mcp__tavily__extract, TodoWrite]
argument-hint: <pr_number>
---

!./scripts/gh/get-unresolved-pr-comments.sh $1

## Task

Resolve the unresolved PR feedback above for PR #$1.

## Workflow

### 1. Analyze & Group (main agent)
- Parse comments above, group related ones (same file, same concern, dependencies)
- Create todo list tracking each group

### 2. Research & Plan (parallel subagents)
Spawn subagents per group to research and return a fix plan:
- **Explore**: Understand affected code areas
- **Context**: Read relevant `log/*.md` for working history
- **Docs**: If architectural/pattern changes, check `docs/` technical specs
- **Research**: If unfamiliar tech or complex areas, use tavily tools
- **Flag conflicts**: If fix conflicts with `log/` or `docs/`, report it

Subagents return: summary of findings + proposed fix plan

### 3. Review & Approve (main agent)
- Collect all subagent plans
- If any conflicts flagged: **STOP** and await user decision
- Present consolidated fix plan
- **AWAIT USER APPROVAL** before implementing

### 4. Implement & Verify (main agent)
- Implement approved fixes
- Run test suite, ensure all pass

### 5. Commit (main agent)
- Conventional commit format
- One commit per fix group (combine only if tightly coupled)
- No authorship footnotes
