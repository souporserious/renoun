---
'renoun': minor
'@renoun/mdx': minor
---

Updates the `CodeBlock` component and MDX utilities so code fences are handled consistently in the `Markdown` and `MDX` components.

- `CodeBlock` now accepts raw `pre` element props directly and internally infers the `language`, `path`, and `children` from the nested `code` element.
- The `parsePreProps` helper has been removed from the public API. Any previous `pre: (props) => <CodeBlock {...parsePreProps(props)} />` mappings should switch to `pre: (props) => <CodeBlock {...props} />` or just provide `CodeBlock` when using the `@renoun/mdx/rehype/add-code-block` plugin.
- The `@renoun/mdx` rehype `add-code-block` plugin now also replaces markdown code fences with a `CodeBlock` element, so `CodeBlock` and its meta props work the same way across Markdown and MDX pipelines.
