---
'renoun': minor
---

Exports a `parseCodeProps` utility for the `CodeInline` component to makie it easier to parse and type custom MDX components correctly:

```tsx
import { CodeInline, parseCodeProps } from 'renoun/components'
import type { MDXComponents } from 'renoun/mdx'

export function useMDXComponents() {
  return {
    code: (props) => {
      return <CodeInline {...parseCodeProps(props)} />
    },
  } satisfies MDXComponents
}
```
