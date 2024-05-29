---
'mdxts': minor
---

Removes the `fixImports` prop from `CodeBlock`. This prop fixed imports specifically for situtations like examples that are located in a different project and used relative imports. However, examples should use the library import path instead of relative paths by configuring the `module` field in `tsconfig.json`. More info [here](https://x.com/remcohaszing/status/1794338155963064548).
