#!/bin/bash
set -e

# =============================================================================
# Manage Worktrees Script
# =============================================================================
# List, remove, or sync worktrees
#
# Usage:
#   ./scripts/manage-worktrees.sh list              # List all worktrees
#   ./scripts/manage-worktrees.sh remove <name>     # Remove a worktree
#   ./scripts/manage-worktrees.sh sync-env <name>   # Re-copy env files to worktree
#   ./scripts/manage-worktrees.sh sync-env-all      # Re-copy env files to all worktrees
# =============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration (must match create-worktree.sh)
WORKTREES_DIR="../worktrees"

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
  echo "Usage: $0 <command> [args]"
  echo ""
  echo "Commands:"
  echo "  list                List all worktrees"
  echo "  remove <name>       Remove a worktree and optionally its branch"
  echo "  sync-env <name>     Re-copy env files to a specific worktree"
  echo "  sync-env-all        Re-copy env files to all worktrees in $WORKTREES_DIR"
  echo ""
  echo "Examples:"
  echo "  $0 list"
  echo "  $0 remove line-integration"
  echo "  $0 sync-env stripe-integration"
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

# Get repo root
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
  log_error "Not in a git repository"
  exit 1
fi

cd "$REPO_ROOT"

# =============================================================================
# Commands
# =============================================================================

cmd_list() {
  echo ""
  echo "Git Worktrees:"
  echo "=============="
  git worktree list
  echo ""

  if [ -d "$REPO_ROOT/$WORKTREES_DIR" ]; then
    echo "Worktrees in $WORKTREES_DIR:"
    echo "=============================="
    for dir in "$REPO_ROOT/$WORKTREES_DIR"/*/; do
      if [ -d "$dir" ]; then
        name=$(basename "$dir")
        branch=$(git -C "$dir" branch --show-current 2>/dev/null || echo "unknown")
        has_context=$([ -f "$dir/.context.md" ] && echo "yes" || echo "no")
        echo -e "  ${BLUE}$name${NC}"
        echo "    Branch: $branch"
        echo "    Context: $has_context"
      fi
    done
  else
    echo "No worktrees in $WORKTREES_DIR"
  fi
  echo ""
}

cmd_remove() {
  local name="$1"

  if [ -z "$name" ]; then
    log_error "Worktree name required"
    print_usage
    exit 1
  fi

  local worktree_path="$REPO_ROOT/$WORKTREES_DIR/$name"

  if [ ! -d "$worktree_path" ]; then
    log_error "Worktree not found: $worktree_path"
    exit 1
  fi

  # Get branch name
  local branch=$(git -C "$worktree_path" branch --show-current 2>/dev/null)

  echo ""
  echo -e "${YELLOW}This will remove:${NC}"
  echo "  Worktree: $worktree_path"
  echo "  Branch: $branch (optional)"
  echo ""
  read -p "Continue? (y/N) " -n 1 -r
  echo ""

  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_info "Cancelled"
    exit 0
  fi

  # Remove worktree
  log_info "Removing worktree..."
  git worktree remove "$worktree_path" --force
  log_success "Worktree removed"

  # Ask about branch
  if [ -n "$branch" ]; then
    echo ""
    read -p "Also delete branch '$branch'? (y/N) " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
      git branch -D "$branch"
      log_success "Branch deleted"
    else
      log_info "Branch kept: $branch"
    fi
  fi

  echo ""
  log_success "Done!"
}

cmd_sync_env() {
  local name="$1"

  if [ -z "$name" ]; then
    log_error "Worktree name required"
    print_usage
    exit 1
  fi

  local worktree_path="$REPO_ROOT/$WORKTREES_DIR/$name"

  if [ ! -d "$worktree_path" ]; then
    log_error "Worktree not found: $worktree_path"
    exit 1
  fi

  log_info "Syncing env files to: $name"

  for file in "${ENV_FILES[@]}"; do
    if [ -f "$REPO_ROOT/$file" ]; then
      target_dir=$(dirname "$worktree_path/$file")
      mkdir -p "$target_dir"
      cp "$REPO_ROOT/$file" "$worktree_path/$file"
      log_success "Copied: $file"
    else
      log_warn "Skipped (not found): $file"
    fi
  done

  echo ""
  log_success "Done!"
}

cmd_sync_env_all() {
  if [ ! -d "$REPO_ROOT/$WORKTREES_DIR" ]; then
    log_error "No worktrees directory found: $WORKTREES_DIR"
    exit 1
  fi

  for dir in "$REPO_ROOT/$WORKTREES_DIR"/*/; do
    if [ -d "$dir" ]; then
      name=$(basename "$dir")
      echo ""
      cmd_sync_env "$name"
    fi
  done
}

# =============================================================================
# Main
# =============================================================================

case "${1:-}" in
  list)
    cmd_list
    ;;
  remove)
    cmd_remove "$2"
    ;;
  sync-env)
    cmd_sync_env "$2"
    ;;
  sync-env-all)
    cmd_sync_env_all
    ;;
  *)
    print_usage
    exit 1
    ;;
esac
