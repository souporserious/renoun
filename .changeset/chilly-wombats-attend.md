---
'renoun': minor
---

Deprecates the `collection` utility in favor of using the `Collection` class directly:

```diff
-- import { collection } from 'renoun/collections'
++ import { Collection } from 'renoun/collections'

-- export const PostsCollection = collection({
++ export const PostsCollection = new Collection({
  filePattern: 'posts/*.mdx',
  baseDirectory: 'posts',
  basePath: 'posts',
})
```
