---
'renoun': minor
---

Refactors the file-system API around `Repository`, including lazy clone behavior, repository-first helpers, and git file system renames.

### Breaking Changes

- Renames `GitHostFileSystem` to `GitVirtualFileSystem`.
- The `Repository` utility should now be preferred over using the git utilities directly:

```tsx
import { Repository } from 'renoun'

const repository = new Repository({
  path: 'https://github.com/mrdoob/three.js',
})
const directory = repository.getDirectory('src/nodes')
```
