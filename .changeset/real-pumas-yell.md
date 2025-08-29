---
'renoun': minor
---

Renames `JavaScriptFileExport` to `JavaScriptModuleExport`, `MDXFileExport` to `MDXModuleExport`, and `FileExportNotFoundError` to `ModuleExportNotFoundError` for improved clarity and to better reflect the functionality of the utilities.

### Breaking Changes

Rename all call sites for `JavaScriptFileExport`, `MDXFileExport`, and `FileExportNotFoundError` to use `Module` instead of `File`.
