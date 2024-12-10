---
'renoun': minor
---

Adds `pathCasing` option to `Directory` for setting the casing of all path methods. This is useful for ensuring that all paths are in a consistent casing, regardless of the underlying file system.

```ts
import { Directory } from 'renoun/file-system'

const directory = new Directory({
  path: 'components',
  pathCasing: 'kebab',
})
const file = await directory.getFileOrThrow('button')

file.getPath() // '/button'

const directory = await directory.getDirectoryOrThrow('card')

directory.getPath() // '/card'
```
