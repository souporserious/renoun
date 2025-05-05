---
'renoun': patch
---

Fixes `JavaScriptFileExport#getType` references being collapsed when `strictNullChecks` is configured in the project's compiler options. The presence of generic type arguments are now considered before further resolving parameter and property types.
