---
'renoun': minor
---

Introduces a concept of "composite collections". This allows overloading the `collection` utility to treat a set of collections as a single collection:

```tsx
const CollectionsCollection = collection({
  filePattern: 'src/collections/index.tsx',
  baseDirectory: 'collections',
})

const ComponentsCollection = collection({
  filePattern: 'src/components/**/*.{ts,tsx}',
  baseDirectory: 'components',
})

const AllCollections = collection(CollectionsCollection, ComponentsCollection)
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
