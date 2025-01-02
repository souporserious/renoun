---
'renoun': minor
---

Exports `FileSystem`, `MemoryFileSystem`, and `NodeFileSystem` classes for creating custom file systems as well as `Repository` for normalizing git providers.

```js
import { Directory, MemoryFileSystem } from 'renoun/file-system'

const fileSystem = new MemoryFileSystem({
  'index.mdx': '# Hello, World!',
})
const directory = new Directory({ fileSystem })
```
