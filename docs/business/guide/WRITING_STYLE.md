# Writing Style Guide

All documents in `/docs` must follow these rules.

---

## Document Structure

### Front Matter (Required)
Every document must start with:

```markdown
---
title: [Clear, concise title]
description: [What this doc covers and its scope - 1-2 sentences max]
---
```

### Scope Discipline
- **Stay in scope** - Only write about what this document is meant to cover
- **Reference out-of-scope items** - Use tags or links, never elaborate
  - Reference other docs: See [2_cost_analysis.md]
  - Mark future work: [TBD in 4_demand_validation.md]
  - Mark uncertain items: [NEED VALIDATION]

---

## Writing Principles

### Simple & Concise
- No fluff, no jargon unless necessary
- Every sentence must inform a decision
- If it doesn't add value, delete it

### Action-Oriented
- What are we doing?
- Why are we doing it?
- What's next?

### Bullet Points Preferred
- Walls of text slow us down
- Use bullets for lists, options, criteria
- Use short paragraphs only when necessary for clarity

### Living Documents
- Update as you learn
- Mark sections that need updating with tags
- Never let docs go stale

---

## Standard Tags

Use these consistently across all docs:

- **[TBD]** - Decision not yet made, will be decided later
- **[TBD in X.md]** - Decision will be made in a specific document
- **[NEED VALIDATION]** - Assumption that requires testing
- **[VALIDATED]** - Assumption that has been tested and confirmed
- **[BLOCKED]** - Cannot proceed until something else is done
- **[ASSUMPTION]** - Explicitly marking an unvalidated belief

---

## Formatting Rules

### No Emojis
Never use emojis in business documents.

### Headings
- Use `##` for major sections
- Use `###` for subsections
- Keep heading text short and descriptive

### Lists
- Use `-` for unordered lists
- Use `1.` for ordered/sequential lists
- Nest with proper indentation

### Links
- Internal docs: `[2_cost_analysis.md]`
- External: Full URLs with descriptive text

### Code/Commands
- Use backticks for inline: `command`
- Use code blocks for multi-line

---

## Examples

### Good Front Matter
```markdown
---
title: Competitive Landscape
description: Analysis of existing event photo distribution platforms, their features, pricing, and user complaints. Identifies switching signals and differentiation opportunities.
---
```

### Bad Front Matter
```markdown
# My Document
This document is about stuff.
```

### Good Scope Discipline
```markdown
## Pricing Model
- Competitor pricing ranges from $50-200/event
- Our target: $30-100/event [TBD in 3_positioning.md based on cost analysis]
- Payment processing: [TBD in 5_technical_architecture.md]
```

### Bad Scope Discipline
```markdown
## Pricing Model
We should charge less than competitors. Also, we need to figure out payment processing - maybe Stripe? And we should think about refund policies and tax handling and international currencies...
```

### Good Tagging
```markdown
- Feature X is critical [VALIDATED - 8/10 users requested in interviews]
- Feature Y might be useful [ASSUMPTION - not yet tested]
- Feature Z cost unknown [TBD in 2_cost_analysis.md]
```

### Bad Tagging
```markdown
- Feature X is good
- Feature Y is probably fine
- Feature Z we'll figure out later
```

---

## Quality Checklist

Before marking a doc as complete, verify:

- [ ] Front matter present with title and description
- [ ] Purpose and scope are clear
- [ ] No out-of-scope elaboration
- [ ] Out-of-scope items properly tagged or linked
- [ ] No emojis
- [ ] Bullet points used where appropriate
- [ ] No fluff or unnecessary words
- [ ] Every section informs a decision
- [ ] Next actions are clear
