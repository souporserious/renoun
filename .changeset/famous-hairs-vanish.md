---
'renoun': minor
---

Introduces a new `CompositeCollection` class. This allows grouping a set of collections to treat them as a single collection:

```tsx
import { Collection, CompositeCollection } from 'renoun/collections'

const CollectionsCollection = new Collection({
  filePattern: 'src/collections/index.tsx',
  baseDirectory: 'collections',
})

const ComponentsCollection = new Collection({
  filePattern: 'src/components/**/*.{ts,tsx}',
  baseDirectory: 'components',
})

const AllCollections = new CompositeCollection(
  CollectionsCollection,
  ComponentsCollection
)
```

When getting a source from a composite collection, the `<FileSystemSource>.getSiblings` method will account for all collections in the composite collection:

```tsx
const source = AllCollections.getSource('collections/index')!

const [previousSource, nextSource] = await source.getSiblings()
```

A new `<Collection>.hasSource` type guard is also available to help constrain the type of the source when working with composite collections:

```tsx
if (ComponentsCollection.hasSource(nextSource)) {
  // nextSource is now typed as a ComponentsCollection source
}
```
