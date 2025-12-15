---
title: Custom Slash Commands Reference
description: Quick reference for writing custom slash commands in Claude Code.
---

## File Locations

**Project commands** (shared): `.claude/commands/*.md`  
**Personal commands** (user): `~/.claude/commands/*.md`  
**Command name:** filename without `.md`  
**Namespace:** subdirectories for organization (shown in description only)

---

## Syntax

```markdown
---
description: Brief description
allowed-tools: [Bash, Editor, WebFetch]
argument-hint: <required> [optional]
model: claude-sonnet-4-20250514
---

Prompt content with $ARGUMENTS or $1, $2...

!bash commands here
@file-references.md
```

---

## Frontmatter

| Field | Purpose | Default |
|-------|---------|---------|
| `description` | Shown in `/help` | First line |
| `allowed-tools` | `[Bash, Editor, WebFetch]` | Inherits |
| `argument-hint` | Argument syntax hint | None |
| `model` | Specific model | Current |

---

## Arguments

**All arguments:**
```markdown
$ARGUMENTS
```

**Positional:**
```markdown
$1 $2 $3...
```

**With defaults:**
```markdown
${1:-default}
```

---

## Bash Execution

Prefix with `!`, requires `allowed-tools: [Bash]`:

```markdown
---
allowed-tools: [Bash]
---

!git diff $1
!ls -la

Analyze output above.
```

---

## File References

```markdown
@src/file.py
@$1
```

---

## Examples

### Simple Prompt
```markdown
---
description: Explain code simply
---

Explain this code in simple terms:

@$1
```

### With Bash
```markdown
---
description: Review PR
a#2llowed-tools: [Bash]
argument-hint: <branch>
---

!git diff main...$1

Review for:
- Code quality
- Test coverage  
- Breaking changes
```

### Multi-file Analysis
```markdown
---
description: Compare implementations
argument-hint: <file1> <file2>
---

Compare these approaches:

@$1
@$2

Recommend which is better and why.
```

### Template Generator
```markdown
---
description: Generate React component
argument-hint: <ComponentName>
---

Create React component $1:

- TypeScript
- Props interface
- Default export
- Tests

Follow style in @.eslintrc.json
```

### Workflow
```markdown
---
description: Feature branch workflow
allowed-tools: [Bash, Editor]
argument-hint: <feature-name>
---

!git checkout -b feature/$1

1. Create branch
2. Generate boilerplate
3. Add tests
4. Update docs

Feature: $1
```

---

## Patterns

**Direct instructions:**
```markdown
Review @$1 for security issues. List vulnerabilities with severity.
```

**Context + task:**
```markdown
!git log --oneline -10

Review recent commits. Suggest changelog entries.
```

**Checklist style:**
```markdown
Analyze @$1:
- [ ] Performance bottlenecks
- [ ] Memory leaks
- [ ] Error handling
```

**Conditional logic:**
```markdown
Deploy to $1:
- If production: full test suite
- If staging: smoke tests
- Validate config before deploy
```

---

## Best Practices

- **Naming:** kebab-case, descriptive (`review-security.md` not `review.md`)
- **Scope tools:** Only include needed tools in `allowed-tools`
- **One purpose:** Keep commands focused
- **Use bash:** For expensive operations vs asking Claude to run commands
- **Namespace:** Organize by domain (`.claude/commands/frontend/`)

---

## Quick Template

```markdown
---
description: What it does
allowed-tools: [Bash, Editor]
argument-hint: <arg1> [arg2]
---

!command $1

Your prompt with $ARGUMENTS

@file.md
```

**Invoke:** `/command-name arg1 arg2`

---

*Source: https://code.claude.com/docs/en/slash-commands*
