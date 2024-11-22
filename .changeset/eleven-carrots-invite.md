---
'renoun': minor
---

Removes `isFileWithExtension` and reimplements it within `isFile` which now allows an optional second `extension` argument.

### Breaking Changes

To upgrade, replace all instances of `isFileWithExtension` with `isFile`. Previous usage of `isFile` will still work as expected.
