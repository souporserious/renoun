---
'renoun': minor
---

Adds `filter` method to `Directory` to allow filtering all entries within each directory:

```ts
import { Directory, isFileWithExtension } from 'renoun'

type PostType = { frontmatter: { title: string } }

const posts = new Directory<{ mdx: PostType }>({ path: 'posts' }).filter(
  (entry) => isFileWithExtension(entry, 'mdx')
)

const files = await posts.getEntries() // JavaScriptFile<PostType>[]
```
