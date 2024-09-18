---
'renoun': minor
---

Adds the ability to filter export sources when creating a collection:

```tsx
import {
  createCollection,
  isFileSystemSource,
  isExportSource,
} from 'renoun/collections'

export const ComponentsCollection = createCollection<
  Record<string, React.ComponentType>
>('src/components/**/*.{ts,tsx}', {
  baseDirectory: 'components',
  basePath: 'components',
  filter: (source) => {
    if (isFileSystemSource(source)) {
      if (source.isFile()) {
        const allInternal = source
          .getExports()
          .every((exportSource) =>
            exportSource.getTags()?.every((tag) => tag.tagName === 'internal')
          )

        if (allInternal) {
          return false
        }
      }
    }

    if (isExportSource(source)) {
      if (source.getTags()?.find((tag) => tag.tagName === 'internal')) {
        return false
      }
    }

    return true
  },
})
```
