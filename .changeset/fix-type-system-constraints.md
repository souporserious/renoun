---
'renoun': patch
---

Allows defining one top-level loader that receives the `path` with the extension for bundlers that support this:

```tsx
import { Directory } from 'renoun'

new Directory({
  loader: (path) => import(`@/posts/${path}`),
})
```
