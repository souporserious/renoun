---
'renoun': major
---

Removes all `*OrThrow` methods from `Directory` and `EntryGroup`. This also exports two new custom errors, `FileNotFoundError` and `FileExportNotFoundError` to handle missing files and exports.

### Breaking Changes

`Directory` and `EntryGroup` no longer have `*OrThrow` methods, use the respective methods instead. To get the same functionality as before, you can catch the error and handle it accordingly:

```ts
import { Directory } from 'renoun/file-system'

const posts = new Directory({ path: 'posts' })

posts.getFile('hello-world', 'mdx').catch((error) => {
  if (error instanceof FileNotFoundError) {
    return undefined
  }
  throw error
})
```
