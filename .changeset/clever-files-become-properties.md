---
'renoun': major
---

Refactors `File` and `Directory` to expose sync metadata as properties (`name`, `baseName`, `kind`, `order`, `extension`).

### Breaking Changes

To update your code, replace calls to the following methods:

- `getName()` → `name`
- `getBaseName()` → `baseName`
- `getModifierName()` → `kind`
- `getOrder()` → `order`
- `getExtension()` → `extension`
