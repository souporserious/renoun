---
'renoun': minor
---

Deprecates `Collection`, `CompositeCollection`, `isExportSource`, `isFileSystemSource`, and `isCollectionSource`. These will be removed in the next major version.

### Updating to File System utilities

The `Collection` and `CompositeCollection` classes have been deprecated in favor of the new `renoun/file-system` utilities. The `isExportSource`, `isFileSystemSource`, and `isCollectionSource` functions have also been deprecated.

To update your code, replace any instances of `Collection` with `Directory` and `CompositeCollection` with `EntryGroup`. For example, the following code:

```ts
import { Collection, CompositeCollection } from 'renoun/collections'

const docs = new Collection({
  filePattern: '*.mdx',
  baseDirectory: 'docs',
})
const components = new Collection({
  filePattern: '*.{ts,tsx}',
  baseDirectory: 'src/components',
})
const compositeCollection = new CompositeCollection(docs, components)
```

should be replaced with:

```ts
import { Directory, EntryGroup, isFile } from 'renoun/file-system'

const docs = new Directory({ path: 'docs' }).filter((entry) =>
  isFile(entry, 'mdx')
)
const components = new Directory({ path: 'src/components' }).filter((entry) =>
  isFile(entry, ['ts', 'tsx'])
)
const entryGroup = new EntryGroup({ entries: [docs, components] })
```
