---
'mdxts': minor
---

Adds a `fixImports` prop to `CodeBlock` to allow fixing imports when the source code references files outside the project and can't resolve correctly:

```tsx
import { CodeBlock } from 'mdxts/components'

const source = `
import { Button } from './Button'

export function BasicUsage() {
  return <Button>Click Me</Button>
}
`

export default function Page() {
  return <CodeBlock fixImports value={source} />
}
```

An example of this is when rendering a source file that imports a module from a package that is not in the immediate project. The `fixImports` prop will attempt to fix these broken imports using installed packages if a match is found:

```diff
--import { Button } from './Button'
++import { Button } from 'design-system'

export function BasicUsage() {
  return <Button>Click Me</Button>
}
```
