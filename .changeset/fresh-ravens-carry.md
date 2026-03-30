---
'renoun': minor
---

Fixes cache isolation for git-backed analysis by keying runtime git metadata to
resolved history state and by hashing isolated analysis worktree directories so
different repositories cannot collide in the same cache path.

### Breaking Changes

Makes repository selection APIs more explicit by requiring `Repository`
instances at higher-level entry points and by adding `Repository.local(...)`
and `Repository.remote(...)` helpers for intentional repository construction.

This is a breaking API change for callers that passed raw repository strings or
configs directly into high-level components and file-system helpers.
