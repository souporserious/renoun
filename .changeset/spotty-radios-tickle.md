---
'renoun': minor
---

Exports the `parsePreProps` utility for the `CodeBlock` component instead of attaching it to the component itself:

```tsx
import { CodeBlock, parsePreProps } from 'renoun/components'
import type { MDXComponents } from 'renoun/mdx'

export function useMDXComponents() {
  return {
    pre: (props) => {
      return <CodeBlock {...parsePreProps(props)} />
    },
  } satisfies MDXComponents
}
```
