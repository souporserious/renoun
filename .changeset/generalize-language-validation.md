---
'renoun': minor
---

Fixes language validation to prevent mismatched language/file combinations for any file type, not just JavaScript. Previously, only JavaScript/TypeScript files were validated against their language parameters. Now all file types are validated using a comprehensive mapping derived from grammar data.
