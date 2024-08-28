---
'mdxts': minor
---

Adds `APIReference` component. This replaces the previous `ExportedTypes` component and is used to document the API of module exports using collections:

```tsx
import { APIReference } from 'mdxts/components'
import { createCollection } from 'mdxts/collections'

const ComponentsCollection = createCollection('components/**/*.{ts,tsx}', {
  baseDirectory: 'components',
  basePath: 'components',
})

export default function Component({ params }) {
  return ComponentsCollection.getSource(params.slug)
    .getExports()
    .map((exportSource) => (
      <APIReference key={exportSource.name} source={exportSource} />
    ))
}
```
