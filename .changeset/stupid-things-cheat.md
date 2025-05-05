---
'renoun': minor
---

Filters `undefined` union members from optional properties in `JavaScriptFileExport#getType`. When using `strictNullChecks`, optional properties would previously add an `undefined` member to the union type. However, this is not necessary for the generated metadata and adds noise to the type text.
