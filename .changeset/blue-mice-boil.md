---
'renoun': minor
---

Implements `<JavaScriptFile>.getExport` as an async method that now resolves the metadata of the export when it is initialized. This removes the need to `await` all methods like `getName`, `getDescription`, and `getTags`. Additionally, this adds a new `<JavaScriptFile>.hasExport` method for checking if the file has a specific export.
