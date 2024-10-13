---
'renoun': major
---

Removes the deprecated `collection` function.

### Breaking Changes

The `collection` function has been removed. You can now use the `Collection` class directly to create a collection:

```tsx
import { Collection } from 'renoun/collections'

const posts = new Collection({
  filePattern: 'posts/*.mdx',
})
```
