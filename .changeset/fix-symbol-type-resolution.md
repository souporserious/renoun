---
'renoun': patch
---

Fixes `UnresolvedTypeExpressionError` when resolving JavaScript files that use `WeakMap` or other types with symbol type parameters. The `isSymbolType` function now correctly detects `ESSymbol` and `UniqueESSymbol` types using TypeScript's type flags.
