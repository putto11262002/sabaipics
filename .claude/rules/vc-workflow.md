# Version Control Workflow (Graphite Stacked PRs)

## Branch strategy

Use **Graphite (`gt`)** for all branch and PR operations. Never use raw `git push` or `gh pr create`.

- Trunk branch: `master`
- Every PR must be part of a **stack** — even single PRs are a stack of one.
- Keep each branch focused on **one logical change** (< 400 lines diff is ideal).

## Creating branches

```sh
# Stage changes first, then:
gt create <short-descriptive-name> -m "commit message"

# Stack another change on top:
gt create <next-change-name> -m "commit message"
```

- Branch names: lowercase kebab-case, e.g. `fix/auth-redirect`, `feat/upload-api`.
- One commit per branch (use `gt modify` to amend, not `git commit --amend`).

## Submitting PRs

```sh
gt submit --stack    # push entire stack to GitHub
gt submit            # push current branch + downstack only
```

- Never use `git push` directly — it bypasses Graphite metadata.
- PR title/body are set interactively or via `--title` / `--body` flags.

## Responding to review feedback

```sh
gt checkout <branch>   # navigate to the branch that needs changes
# make fixes, stage them
gt modify              # amend + auto-restack all upstack branches
gt submit --stack      # update all PRs in the stack
```

## Syncing with trunk

```sh
gt sync                # pull latest trunk, rebase stacks, prune merged branches
```

Run `gt sync` at the start of each session and before creating new stacks.

## Navigation

```sh
gt log                 # visualize current stack
gt up / gt down        # move between stack branches
gt top / gt bottom     # jump to tip / base of stack
gt checkout            # interactive branch picker
```

## Resolving conflicts

```sh
# During a restack/sync that hits a conflict:
# 1. Fix the conflicting files
# 2. Stage the resolved files
gt continue            # resume the operation
gt abort               # or cancel if needed
```

## Do

- Run `gt sync` before starting new work.
- Keep stacks small (2–5 PRs max).
- Use `gt modify` for all amendments — it restacks descendants automatically.
- Use `gt submit --stack` to keep all PRs in sync.
- Use `gt merge` to merge an approved stack via Graphite.

## Don't

- Don't use `git push`, `git rebase`, or `gh pr create` — they break Graphite metadata.
- Don't amend with `git commit --amend` — use `gt modify` instead.
- Don't force-push (`git push --force`) — `gt submit` handles force-pushes safely.
- Don't create long-lived feature branches — stack small PRs instead.

## Reference

- Docs: <https://graphite.com/docs>
- Cheatsheet: <https://graphite.com/docs/cheatsheet>
- Troubleshooting: <https://graphite.com/docs/troubleshooting>
