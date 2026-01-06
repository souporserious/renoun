---
'renoun': major
---

Improves `File` interoperability by implementing native `Blob` methods, making it compatible with Node.js APIs and tooling that expect a `Blob` interface.

### Breaking Changes

`File#getBinary` method has been renamed to `File#bytes` to align with the `Blob` interface. Additionally, `File#arrayBuffer` has been added to provide standard functionality for retrieving file data as an `ArrayBuffer`.
