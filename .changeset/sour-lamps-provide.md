---
'renoun': minor
---

Renames file system methods `filter` to `withFilter` and `sort` to `withSort` for better clarity since they are not immediately applied.

### Breaking Changes

- `<Directory>.filter` method is now `<Directory>.withFilter`
- `<Directory>.sort` method is now `<Directory>.withSort`
