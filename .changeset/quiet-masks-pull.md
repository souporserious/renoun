---
'renoun': minor
'@renoun/mdx': minor
---

Updates how to use the `CodeBlock` component in MDX. When using `renoun/mdx`, a new `addCodeBlock` rehype plugin rewrites the `pre` element to a `CodeBlock` element. This is more explicit and requires defining a `CodeBlock` component now.

### Breaking Changes

If you are using the `renoun/mdx` plugins, wherever you pass additional MDX components needs to be updated to provide a `CodeBlock` component now:

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

If you are not using `renoun/mdx` plugins `parsePreProps` is still required.
