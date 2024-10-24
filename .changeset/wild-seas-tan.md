---
'renoun': major
---

Updates the `<Collection>.getSource` method to be asynchronous and return a `Promise` that resolves to the source. This allows for more flexibility for a source to communicate with the web socket server.

### Breaking Changes

The `getSource` method for a `Collection` and `CompositeCollection` now returns a `Promise` that resolves to the source. This means that you will need to `await` the result when calling this method:

```diff
import { Collection } from 'renoun/collections'

const posts = new Collection({
  filePattern: 'posts/*.mdx',
})

export default async function Page({ params }: { params: { slug: string } }) {
--  const post = posts.getSource(params.slug)
++  const post = await posts.getSource(params.slug)

  if (!post) {
    return <div>Post not found</div>
  }

  const Content = await post.getExport('default').getValue()

  return <Content />
}
```
