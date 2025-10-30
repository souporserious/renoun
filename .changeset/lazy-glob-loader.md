---
'renoun': minor
---

Adds support for loader factories and globbed modules when defining a `Directory` loader:

```tsx
import { Directory, withSchema } from 'renoun'

interface PostType {
  frontmatter: {
    title: string
    date: Date
  }
}

const posts = new Directory({
  path: 'posts',
  loader: () => {
    const mdxModules = import.meta.glob('./posts/**/*.mdx')
    return {
      mdx: withSchema<PostType>((path) => mdxModules[`./posts/${path}.mdx`]),
    }
  },
})
```
