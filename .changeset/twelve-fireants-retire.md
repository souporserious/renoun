---
'mdxts': patch
---

Fixes polluting `CodeBlock` globals by always adding a `export { }` declaration to the AST and only removing it from the rendered tokens.
