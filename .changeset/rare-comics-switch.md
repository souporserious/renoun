---
'renoun': major
---

Renames `createCollection` to `collection`.

### Breaking Changes

Replace all instances of `createCollection` with `collection`:

```diff
-import { createCollection } from 'renoun/collections'
+import { collection } from 'renoun/collections'

-const PostsCollection = createCollection({
+const PostsCollection = collection({
  filePattern: 'posts/*.mdx',
})
```
