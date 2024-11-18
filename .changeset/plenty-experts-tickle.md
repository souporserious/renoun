---
'renoun': minor
---

Adds `filter` method to `Directory` to allow filtering all entries within a directory:

```ts
type PostType = { frontmatter: { title: string } }

const posts = new Directory<{ mdx: PostType }>({
  path: 'fixtures/posts',
}).filter((entry) => isFileWithExtension(entry, 'mdx'))

const files = await posts.getFiles() // JavaScriptFile<PostType>[]
```
