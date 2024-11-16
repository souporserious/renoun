---
'renoun': minor
---

Adds `hasExtension` method to `File` to help constrain the type:

```ts
import { Directory } from 'renoun/file-system'

const posts = new Directory<{
  mdx: { frontmatter: { title: string } }
}>({
  path: 'posts',
})

const mdxFiles = await posts
  .getFiles()
  .filter((post) => post.hasExtension('mdx'))
```
