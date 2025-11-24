---
'renoun': patch
---

Fixes several issues in `JavaScriptModuleExport#getType` type resolution:

- **Constructor overloads**: Now properly resolves all constructor overload signatures using `getType().getCallSignatures()`, matching the behavior of `Function` and `ClassMethod` overloads. Includes fallback for JavaScript files where type information may be limited.

- **Mapped type resolution**: Fixes resolution of mapped types that come from type aliases (e.g., `type ThemeMap = Record<string, ThemeValue>`) by checking alias symbol declarations and falling back to type reference resolution when the mapped node cannot be found. This ensures type aliases to utility types like `Record` are properly resolved.

- **Stricter error handling**: Added error throwing in `resolveMemberSignature` when property or call signature resolution fails, ensuring type resolution errors are properly surfaced instead of silently returning undefined.

- **Metadata consistency**: Added missing `filePath` and `position` metadata to `ClassMethod` objects for consistency with other resolved types.

- **Fixes Kind.Shared type**: Fixes incorrect `Kind.Shared` file path type `path` -> `filePath`.
