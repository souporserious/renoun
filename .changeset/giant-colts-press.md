---
'renoun': minor
---

Adds `sort` method to `Directory` to allow sorting all entries within each directory:

```ts
import { Directory, isFileWithExtension } from 'renoun'

type PostType = { frontmatter: { title: string } }

const posts = new Directory<{ mdx: PostType }>({ path: 'posts' })
  .filter((entry) => isFileWithExtension(entry, 'mdx'))
  .sort(async (a, b) => {
    const aFrontmatter = await a.getExport('frontmatter').getRuntimeValue()
    const bFrontmatter = await b.getExport('frontmatter').getRuntimeValue()

    return aFrontmatter.title.localeCompare(bFrontmatter.title)
  })

const files = await posts.getEntries() // JavaScriptFile<PostType>[] sorted by front matter title
```
