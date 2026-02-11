---
'renoun': patch
---

Improves export analysis accuracy: resolves `export default X` to the actual declaration for hashing, tracks `localName` on export changes, strips JSDoc inline tags from deprecation messages, and adds same-name move detection for re-export reorganizations.
