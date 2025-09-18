---
'renoun': minor
---

Adds a `Navigation` component that takes a `source` which can be a `FileSystemEntry` or a `Collection` and renders the entries recursively.

```tsx
import { Navigation } from 'renoun'

export default function Sidebar({
  source,
}: {
  source: FileSystemEntry | Collection
}) {
  return (
    <aside>
      <Navigation source={source} />
    </aside>
  )
}
```
