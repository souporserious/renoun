---
'renoun': patch
---

Fixes `ModuleExport#getType` crashing on TypeScript intrinsic `object` types that appear without an `ObjectKeyword` node.
