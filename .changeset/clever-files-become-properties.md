---
'renoun': major
---

Refactors `File`, `Directory`, and `ModuleExport` to expose sync metadata as properties (`name`, `baseName`, `kind`, `order`, `extension`, `slug`, `description`).

### Breaking Changes

To update your code, replace calls to the following methods:

- `getName()` → `name`
- `getBaseName()` → `baseName`
- `getModifierName()` → `kind`
- `getTitle()` → `title`
- `getOrder()` → `order`
- `getExtension()` → `extension`
- `getSlug()` → `slug`
- `getDescription()` → `description`
