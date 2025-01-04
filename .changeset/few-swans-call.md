---
'renoun': minor
---

Adds a default `mdx` loader to `JavaScriptFile` that uses the `MDXRenderer` component. This allows MDX files without imports to be rendered easily:

```tsx
import { Directory } from 'renoun/file-system'

const posts = new Directory({ path: 'posts' })

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const slug = (await params).slug
  const post = await posts.getFile(slug, 'mdx')
  const Content = await post.getExportValue('default')

  return <Content />
}
```
