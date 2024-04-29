---
'mdxts': minor
---

Adds a new `sort` option to `createSource`:

```tsx
import { createSource } from 'mdxts'

const allPosts = createSource<{ frontMatter: { date: Date } }>('**/*.mdx', {
  sort: (a, b) => a.frontMatter.date - b.frontMatter.date,
})
```
