---
'renoun': minor
---

Renames `Directory#getEntries` option `includeIndexAndReadme` to `includeIndexAndReadmeFiles` to better align with the other options.

### Breaking Changes

Rename any `Directory#getEntries` call sites that use the `includeIndexAndReadme` and update the option name to `includeIndexAndReadmeFiles`.
