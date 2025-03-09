---
'renoun': minor
---

Improves composition for `CodeBlock` by allowing `Tokens` to accept string children to be tokenized and highlighted:

```tsx
import { Tokens } from 'renoun/components'

export function App() {
  return <Tokens>const foo = 'bar';</Tokens>
}
```

This removes the need to pass a `value` prop to `CodeBlock`.

### Breaking Changes

The `CodeBlock` `value` prop should now be passed as a child to the `Tokens` component:

```diff
-<CodeBlock language="ts" value="const foo = 'bar';" />
+<CodeBlock language="ts">const foo = 'bar';</CodeBlock>
```
