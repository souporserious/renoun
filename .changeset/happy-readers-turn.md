---
'renoun': minor
---

Removes predefined `MDXComponents` components since it's easy to instantiate yourself which allows overriding defaults. The same functionality can be achieved by defining the components directly:

```tsx
import { CodeBlock, CodeInline } from 'renoun/components'
import type { MDXComponents } from 'renoun/mdx'

const mdxComponents = {
  pre: (props) => {
    const { value, language } = CodeBlock.parsePreProps(props)
    return <CodeBlock allowErrors value={value} language={language} />
  },
  code: (props) => {
    return <CodeInline value={props.children} language="typescript" />
  },
} satisfies MDXComponents
```
