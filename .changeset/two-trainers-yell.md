---
'mdxts': minor
---

`CodeBlock` now tries to parse `workingDirectory` as a `URL` and gets the pathname directory. This allows using `import.meta.url` directly in the `workingDirectory` prop:

```tsx
<CodeBlock
  source="./counter/useCounter.ts"
  workingDirectory={import.meta.url}
/>
```
