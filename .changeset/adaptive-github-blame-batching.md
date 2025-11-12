---
'renoun': patch
---

Improves `GitHostFileSystem` git metadata collection for GitHub. Now multiple files are batched into one GraphQL query via aliases and use fewer API calls overall. This significantly reduces requests and rate-limit risk for repositories with large histories while preserving useful author/date metadata.
