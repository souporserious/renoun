---
'renoun': minor
---

Adds the ability for `Tokens` to load file contents itself when used inside `CodeBlock`:

```tsx
<CodeBlock path="./counter/Counter.tsx" baseDirectory={import.meta.url}>
  <pre>
    <Tokens />
  </pre>
</CodeBlock>
```
