---
'renoun': minor
---

Removes the `Command` component `css`/`className`/`style` props in favor of a `components` prop similar to other components. Swap sub-components through the new `components` prop, which is typed via `CommandComponents` to reference individual prop types:

```tsx
import type { CommandProps } from 'renoun'

const components: CommandProps['components'] = {
  Container: ({ id, className, children }) => (
    <div data-command-group={id} className={`${className} my-command`}>
      {children}
    </div>
  ),
  Code: {
    Root: ({ className, children, copyButton }) => (
      <code className={`${className} my-command-inline`}>
        {children}
        {copyButton}
      </code>
    ),
  },
}
```
