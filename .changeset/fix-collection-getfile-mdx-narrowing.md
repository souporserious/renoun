---
'renoun': patch
---

Fixes `Collection#getFile` so calls like `getFile('Button.mdx')` correctly infer the `mdx` extension from the path and narrow the return type to `MDXFile`.
