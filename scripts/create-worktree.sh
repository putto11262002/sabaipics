#!/bin/bash
set -e

# =============================================================================
# Create Worktree Script
# =============================================================================
# Creates a git worktree with:
# - Feature branch
# - Copied env files
# - .context.md file with purpose and plan
#
# Usage:
#   ./scripts/create-worktree.sh <branch-name> "<purpose>" "<plan>"
#
# Example:
#   ./scripts/create-worktree.sh line-integration \
#     "Set up LINE Messaging API SDK and webhook infrastructure" \
#     "1. Install SDK\n2. Create webhook endpoint\n3. Add signature verification"
#
# Output:
#   Worktree created at: ../worktrees/<branch-name>
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================================================
# Configuration
# =============================================================================

# Where worktrees are created (relative to repo root's parent)
WORKTREES_DIR="../worktrees"

# Files/directories to copy (relative to repo root)
# These are typically gitignored env files
ENV_FILES=(
  "apps/api/.dev.vars"
  "apps/dashboard/.env.development"
  "apps/dashboard/.env.staging"
  "apps/dashboard/.env.production"
  "apps/ftp-server/.env"
)

# =============================================================================
# Functions
# =============================================================================

print_usage() {
  echo "Usage: $0 <branch-name> [purpose] [plan]"
  echo ""
  echo "Arguments:"
  echo "  branch-name   Name for the feature branch (will be prefixed with 'feat/')"
  echo "  purpose       One-line description of the branch purpose (optional)"
  echo "  plan          Multi-line plan, use \\n for newlines (optional)"
  echo ""
  echo "Examples:"
  echo "  $0 stripe-integration"
  echo "  $0 line-integration \"Set up LINE SDK\" \"1. Install SDK\\n2. Create webhook\""
  echo ""
  echo "If purpose/plan not provided, interactive prompts will ask for them."
}

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# =============================================================================
# Validation
# =============================================================================

if [ -z "$1" ]; then
  log_error "Branch name is required"
  print_usage
  exit 1
fi

BRANCH_NAME="$1"
FULL_BRANCH_NAME="feat/$BRANCH_NAME"
PURPOSE="$2"
PLAN="$3"

# Get repo root directory
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
  log_error "Not in a git repository"
  exit 1
fi

cd "$REPO_ROOT"

# Worktree output path
WORKTREE_PATH="$REPO_ROOT/$WORKTREES_DIR/$BRANCH_NAME"

# Check if worktree already exists
if [ -d "$WORKTREE_PATH" ]; then
  log_error "Worktree already exists at: $WORKTREE_PATH"
  exit 1
fi

# Check if branch already exists
if git show-ref --verify --quiet "refs/heads/$FULL_BRANCH_NAME"; then
  log_warn "Branch '$FULL_BRANCH_NAME' already exists, will use existing branch"
  BRANCH_EXISTS=true
else
  BRANCH_EXISTS=false
fi

# =============================================================================
# Interactive prompts if not provided
# =============================================================================

if [ -z "$PURPOSE" ]; then
  echo ""
  echo -e "${BLUE}Enter the purpose of this branch (one line):${NC}"
  read -r PURPOSE
fi

if [ -z "$PLAN" ]; then
  echo ""
  echo -e "${BLUE}Enter the implementation plan (press Enter twice to finish):${NC}"
  echo -e "${YELLOW}Tip: Number your steps like '1. First step' for clarity${NC}"
  PLAN=""
  while IFS= read -r line; do
    [ -z "$line" ] && break
    PLAN="$PLAN$line\n"
  done
fi

# =============================================================================
# Create branch and worktree
# =============================================================================

log_info "Creating worktree for: $FULL_BRANCH_NAME"

# Create worktrees directory if it doesn't exist
mkdir -p "$REPO_ROOT/$WORKTREES_DIR"

# Create branch if it doesn't exist
if [ "$BRANCH_EXISTS" = false ]; then
  log_info "Creating branch: $FULL_BRANCH_NAME"
  git branch "$FULL_BRANCH_NAME"
  log_success "Branch created"
fi

# Create worktree
log_info "Creating worktree at: $WORKTREE_PATH"
git worktree add "$WORKTREE_PATH" "$FULL_BRANCH_NAME"
log_success "Worktree created"

# =============================================================================
# Copy env files
# =============================================================================

log_info "Copying environment files..."

for file in "${ENV_FILES[@]}"; do
  if [ -f "$REPO_ROOT/$file" ]; then
    # Create directory if needed
    target_dir=$(dirname "$WORKTREE_PATH/$file")
    mkdir -p "$target_dir"

    # Copy the file
    cp "$REPO_ROOT/$file" "$WORKTREE_PATH/$file"
    log_success "Copied: $file"
  else
    log_warn "Skipped (not found): $file"
  fi
done

# =============================================================================
# Create .context.md
# =============================================================================

log_info "Creating .context.md..."

# Convert \n to actual newlines in plan
PLAN_FORMATTED=$(echo -e "$PLAN")

# Determine next log number
LAST_LOG=$(ls -1 "$REPO_ROOT/log/" 2>/dev/null | grep -E '^[0-9]{3}-' | sort -r | head -1)
if [ -n "$LAST_LOG" ]; then
  LAST_NUM=$(echo "$LAST_LOG" | grep -oE '^[0-9]{3}' | sed 's/^0*//')
  NEXT_NUM=$(printf "%03d" $((LAST_NUM + 1)))
else
  NEXT_NUM="001"
fi
LOG_FILENAME="${NEXT_NUM}-${BRANCH_NAME}.md"

cat > "$WORKTREE_PATH/.context.md" << EOF
# ${BRANCH_NAME//-/ } Setup

**Branch:** \`$FULL_BRANCH_NAME\`
**Status:** AWAITING APPROVAL

---

## Purpose

$PURPOSE

---

## Scope

### In Scope

<!-- TODO: Define what's in scope -->

### Out of Scope

<!-- TODO: Define what's NOT in scope -->

---

## Implementation Plan

$PLAN_FORMATTED

---

## Technical References

<!-- TODO: Add relevant doc references -->
- \`docs/tech/\` - Technical design docs

---

## Environment Variables Needed

\`\`\`bash
# TODO: Add required env vars
\`\`\`

---

## Success Criteria

- [ ] <!-- TODO: Add success criteria -->

---

## Log File

Append progress to: \`log/$LOG_FILENAME\`

---

## Approval Required

Please review this scope and plan. Reply with approval to proceed or request changes.
EOF

log_success "Created .context.md"

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "=============================================="
echo -e "${GREEN}Worktree created successfully!${NC}"
echo "=============================================="
echo ""
echo -e "Branch:     ${BLUE}$FULL_BRANCH_NAME${NC}"
echo -e "Path:       ${BLUE}$WORKTREE_PATH${NC}"
echo -e "Context:    ${BLUE}$WORKTREE_PATH/.context.md${NC}"
echo -e "Log file:   ${BLUE}log/$LOG_FILENAME${NC} (create when starting work)"
echo ""
echo "Next steps:"
echo "  1. cd $WORKTREE_PATH"
echo "  2. Edit .context.md to complete the scope and plan"
echo "  3. Get approval before starting work"
echo "  4. Run: pnpm install"
echo ""
