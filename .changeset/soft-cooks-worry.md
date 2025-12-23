---
'renoun': major
---

Improves `File` interoperability by extending the native `Blob` class, making it compatible with web APIs and tooling that expect `Blob` instances. This enables `instanceof Blob` checks and seamless integration with `fetch`, `FormData`, and other web primitives.

### Breaking Changes

The following methods have been renamed/removed:

- `File#getText()` → `File#text()`
- `File#getBinary()` → `File#bytes()` (or `File#arrayBuffer()`)
- `ModuleExport#getText()` → `ModuleExport#text()`
