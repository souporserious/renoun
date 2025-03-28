---
'renoun': minor
---

Includes `MDXContent` type by default now when using `MDXFile`. Previously, `{ default: MDXContent }` had to be defined explicitly. Now, it is merged in automatically with optional export types:

```tsx
import { MDXFile } from 'renoun/file-system'

const file = new MDXFile<{
  frontmatter: { title: string; date: Date }
}>({
  path: 'path/to/file.mdx',
})
```
