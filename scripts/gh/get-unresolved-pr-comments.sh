#!/bin/bash

# Get unresolved PR review comments formatted as markdown for LLM consumption
# Usage: ./get-unresolved-pr-comments.sh <pr_number>
# Example: ./get-unresolved-pr-comments.sh 2

set -e

PR_NUMBER="${1:?Usage: $0 <pr_number>}"

# Get repo owner and name dynamically
REPO_INFO=$(gh repo view --json owner,name)
OWNER=$(echo "$REPO_INFO" | jq -r '.owner.login')
REPO=$(echo "$REPO_INFO" | jq -r '.name')

echo "# Unresolved PR Review Comments - PR #${PR_NUMBER}"
echo ""
echo "## Summary"

gh api graphql -f query="
{
  repository(owner: \"${OWNER}\", name: \"${REPO}\") {
    pullRequest(number: ${PR_NUMBER}) {
      title
      url
      reviewThreads(first: 100) {
        nodes {
          isResolved
          comments(first: 10) {
            nodes {
              body
              path
              line
              author {
                login
              }
            }
          }
        }
      }
    }
  }
}" | jq -r '
  .data.repository.pullRequest as $pr |
  ($pr.reviewThreads.nodes | map(select(.isResolved == false))) as $unresolved |

  "**PR Title:** \($pr.title)\n**PR URL:** \($pr.url)\n**Total Unresolved Comments:** \($unresolved | length)\n",

  "## Unresolved Comments\n",

  ($unresolved | to_entries[] |
    "### \(.key + 1). \(.value.comments.nodes[0].path)\n" +
    "- **Author:** @\(.value.comments.nodes[0].author.login)\n" +
    "- **File:** `\(.value.comments.nodes[0].path)`\n" +
    (if .value.comments.nodes[0].line then "- **Line:** \(.value.comments.nodes[0].line)\n" else "" end) +
    "- **Comment:**\n\n> \(.value.comments.nodes[0].body | gsub("\n"; "\n> "))\n"
  )
'
