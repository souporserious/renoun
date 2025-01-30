---
'renoun': minor
---

Adds a `parseCodeProps` helper to the `CodeInline` component making it easier to type custom MDX components correctly:

```tsx
import { CodeInline } from 'renoun/components'
import type { MDXComponents } from 'renoun/mdx'

export function useMDXComponents() {
  return {
    code: (props) => {
      return <CodeInline {...CodeInline.parseCodeProps(props)} />
    },
  } satisfies MDXComponents
}
```
