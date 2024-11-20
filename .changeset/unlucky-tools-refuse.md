---
'renoun': minor
---

Removes `getDirectories` and `getFiles` from `Directory` now that the `filter` method is available:

```ts
import { Directory, isFileWithExtension } from 'renoun/file-system'

const directory = new Directory()
const files = directory
  .filter((entry) => isFileWithExtension(entry, ['ts', 'tsx']))
  .getEntries()
```
