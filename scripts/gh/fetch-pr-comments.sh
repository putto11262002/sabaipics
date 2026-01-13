#!/bin/bash
# Fetch PR review comments from GitHub
# Usage: ./scripts/gh/fetch-pr-comments.sh <pr-number>

PR_NUMBER=${1:-31}

echo "Fetching comments for PR #${PR_NUMBER}..."
echo "========================================="
echo ""

# Fetch PR review comments
gh pr view ${PR_NUMBER} --json reviews --jq '.reviews[] | "## Review by: \(.author.login)\n**State:** \(.state)\n**Submitted:** \(.submittedAt)\n\n\(.body)\n\n---\n"'

echo ""
echo "Fetching inline review comments..."
echo "========================================="
echo ""

# Fetch review thread comments
gh api repos/{owner}/{repo}/pulls/${PR_NUMBER}/comments --jq '.[] | "### \(.path):\(.position) - @\(.user.login)\n**Line \(.line):** \(.body)\n\n---\n"'
