---
'renoun': minor
---

Introduces a concept of "composite collections". This allows providing a set of collections to the `collection` utility to group collections into one list:

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

const source = AllCollections.getSource('collections/index')!
// now aware there are multiple collections to navigate through
const [previousSource, nextSource] = await source.getSiblings()
```
