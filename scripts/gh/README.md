# GitHub CLI Scripts

Reusable `gh` CLI scripts for agents and automation.

## Scripts

| Script                                      | Description                                                |
| ------------------------------------------- | ---------------------------------------------------------- |
| `get-unresolved-pr-comments.sh <pr_number>` | Get unresolved PR review comments as LLM-friendly markdown |

## Usage

```bash
# Get unresolved comments for PR #2
./scripts/gh/get-unresolved-pr-comments.sh 2
```
