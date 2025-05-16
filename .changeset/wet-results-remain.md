---
'@renoun/mdx': minor
'renoun': minor
---

Adds a `Markdown` component. This should be used when rendering markdown content and is now used to render JS Doc quick info content in the `CodeBlock` component to ensure that the intended markdown is rendered correctly. This is also safer since we do not need to evaluate anything and return JSX elements directly.
