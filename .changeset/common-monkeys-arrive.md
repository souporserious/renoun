---
'renoun': minor
---

Removes `source` and `workingDirectory` props from `CodeBlock` component since these can be calculated using `readFile` explicitly.

### Breaking Changes

The `source` and `workingDirectory` props from `CodeBlock` component have been removed. Use `readFile` to read the source file contents:

```tsx
import { CodeBlock } from 'renoun/components'
import { readFile } from 'node:fs/promises'

export function CodeBlock() {
  return (
    <CodeBlock language="tsx">
      {readFile('src/components/Button.tsx', 'utf-8')}
    </CodeBlock>
  )
}
```
