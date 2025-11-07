---
'@renoun/mdx': minor
---

Adds an anchor to all headings now by default and additionally adds a `Heading` component from the `@renoun/mdx/remark/add-headings` plugin so MDX consumers can override all headings at once:

```tsx path="examples/docs/mdx-components.tsx"
import type { MDXComponents } from 'renoun'

export function useMDXComponents() {
  return {
    Heading: ({ Tag, id, children, ...rest }) => {
      return (
        <Tag id={id} {...rest}>
          <a href={`#${id}`}>{children}</a>
        </Tag>
      )
    },
  } satisfies MDXComponents
}
```

### Breaking Changes

Now that headings contain links by default when using `@renoun/mdx/remark/add-headings` this will require additional styling considerations for headings since they will now inherit anchor styles.
