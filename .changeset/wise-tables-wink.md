---
'renoun': minor
---

Adds the ability to specify only the `path` when initializing a `Directory` instance since this is the most common use case:

```ts
import { Directory } from 'renoun/file-system'

const directory = new Directory('path/to/directory')
```

For more advanced use cases, you can still specify the `options`:

```ts
import { Directory, VirtualFileSystem } from 'renoun/file-system'

const fileSystem = new VirtualFileSystem()
const directory = new Directory({
  path: 'path/to/directory',
  fileSystem,
})
```
