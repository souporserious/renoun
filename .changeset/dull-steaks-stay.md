---
'renoun': minor
---

Renames the `Directory` constructor option from `loaders` to `loader`. This prepares for upcoming support for specifying a single loader.

### Breaking Changes

Update all `Directory` constructor `loaders` option call sites to use the singular `loader`.
