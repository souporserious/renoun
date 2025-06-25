---
'renoun': minor
'@renoun/mdx': minor
---

Updates how to use the `CodeBlock` component in MDX. Instead of overriding the `pre` element. Now when using `renoun/mdx`, a new `addCodeBlock` rehype plugin will rewrite the `pre` element to `CodeBlock`.

### Breaking Changes

If you are using the `renoun/mdx` plugins, wherever you pass components needs to be updated to provide a `CodeBlock` component now:

```diff
import {
    CodeBlock,
--    parsePreProps
} from 'renoun/components'

function useMDXComponents() {
  return {
--    pre: (props) => <CodeBlock {...parsePreProps(props)} />,
++    CodeBlock,
  }
}
```

If you _are not_ using `renoun/mdx` then `parsePreProps` is still required.
