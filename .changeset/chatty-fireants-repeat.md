---
'renoun': minor
---

Renames `Directory` and `File` `getParentDirectory` methods to `getParent` to better align with `getSiblings`. This also aligns more closely with the web File System API's [getParent](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemEntry/getParent) method.

### Breaking Changes

- `Directory.getParentDirectory` is now `Directory.getParent`
- `File.getParentDirectory` is now `File.getParent`
