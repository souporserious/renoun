---
'renoun': major
---

Removes `renoun/collections` package export and all related types and utilities that were deprecated in [v7.8.0](https://github.com/souporserious/renoun/releases/tag/renoun%407.8.0).

### Breaking Changes

The `renoun/collections` package was removed. To upgrade, move to the `renoun/file-system` package and use the `Directory` class instead. In most cases, you can replace `Collection` with `Directory` and `CompositeCollection` with `EntryGroup`.

#### Before

```tsx
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

#### After

```tsx
import { Directory, EntryGroup } from 'renoun/file-system'

const docs = new Directory({
  path: 'docs',
  include: '*.mdx',
})
const components = new Directory({
  path: 'src/components',
  include: '*.{ts,tsx}',
})
const entryGroup = new EntryGroup({
  entries: [docs, components],
})
```
