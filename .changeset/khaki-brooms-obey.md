---
'renoun': minor
---

Allow passing relative `workingDirectory` to `CodeBlock` component, this allows more easily creating virtual files in a specific directory relative to the current working directory:

```tsx
import { CodeBlock } from 'renoun/components'

export default function Example() {
  return (
    <CodeBlock
      workingDirectory="src/components"
      children={`
        import { Button } from './Button';

        export default function Example() {
          return <Button>Click me</Button>;
        }
      `}
    />
  )
}
```
