---
'renoun': minor
---

Adds support for passing a file path to the `APIReference.source` prop:

```tsx
import { APIReference } from 'renoun/components'

export function FilePath() {
  return (
    <APIReference
      source="./GitProvider.tsx"
      workingDirectory={import.meta.url}
    />
  )
}
```
