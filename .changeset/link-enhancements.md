---
'renoun': minor
---

Adds a new `Link` component that helps generate links for directories, files, module exports, and the configured git provider in `RootProvider`.

```tsx
import { JavaScriptFile, Link } from 'renoun'

const file = new JavaScriptFile({
  path: 'components/Button.tsx',
})

function App() {
  return (
    <Link source={file} variant="source">
      View Source
    </Link>
  )
}
```
