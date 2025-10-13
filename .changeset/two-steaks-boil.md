---
'renoun': minor
---

Adds an `annotations` prop to the `CodeBlock` and `Tokens` components to render inline, JSX comment-based annotations. Highlights and ranges are authored directly in the source using inline comments and mapped back after formatting:

```tsx
<CodeBlock
  language="ts"
  annotations={{
    mark: ({ children, color }) => (
      <mark style={{ backgroundColor: color }}>{children}</mark>
    ),
  }}
>
  {`const count = /*mark color='yellow'*/0/**mark*/`}
</CodeBlock>
```

- Paired markers wrap a range: `/* <tag ...> */ … /* </tag> */`.
- Self‑closing markers wrap the next token only: `/* <tag ... /> */identifier`.
- Works across formatter changes; ranges are computed via offsets and remapped after formatting.
