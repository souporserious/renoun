---
'renoun': patch
---

Fixes a git-backed build regression where remote cache clones could fall back to
full clones when `git backfill` was unavailable. This also stops production explicit-ref analysis bootstraps from forcing a full analysis worktree up front, so isolated analysis roots now start from the requested sparse scope and only widen lazily as analysis needs more files.
