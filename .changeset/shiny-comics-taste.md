---
'renoun': patch
---

Fixes a `CodeBlock` regression where the synthetic trailing `export {}` used for
TypeScript module-scoped analysis could leak back into rendered source. The
synthetic export is now kept for type-checking only and trimmed from displayed
snippet output again.
