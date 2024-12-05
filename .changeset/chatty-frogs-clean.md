---
'renoun': patch
---

Fixes duplicate file exports being returned. This was specifically happening when a file export attached a member to the function implementation:

```tsx
export function CodeBlock() {
  // ...
}

CodeBlock.displayName = 'CodeBlock' // This caused the file to be exported twice
```
