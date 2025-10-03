---
'renoun': minor
---

Consolidates the `CodeBlock` and `CodeInline` components into a single `Code` component with a `variant` prop. This is an effort to simplify the API and makes it easier to manage code snippets in both block and inline contexts.

### Breaking Change

Remove the `css`, `className`, `style`, `paddingX`, and `paddingY` props from the `Code` namespace. Use the `components` prop to customize inline and block variants via the new container, pre, code, and inline root override points.

The standalone `CodeBlock` and `CodeInline` exports have also been removed. Use the unified `Code` component instead:

#### Before

```tsx
import { CodeBlock, CodeInline } from 'renoun'

<CodeBlock language="ts">{`const a = 1`}</CodeBlock>
<CodeInline allowCopy>{`npm create renoun`}</CodeInline>
```

#### After

```tsx
import { Code } from 'renoun'

<Code language="ts">{`const a = 1`}</Code>
<Code variant="inline" allowCopy>{`npm create renoun`}</Code>
```

If you rely on the MDX `CodeBlock` slot, because block is the default it can be mapped directly to the block variant:

```tsx
import { Code } from 'renoun'

export function useMDXComponents() {
  return {
    CodeBlock: Code,
  }
}
```

Custom MDX renderers no longer need to call `Code.parsePreProps` or `Code.parseCodeProps`. Pass the element props directly and the `Code` component will normalize them for you:

#### Before

```tsx
pre: (props) => <Code {...Code.parsePreProps(props)} />
code: (props) => <Code variant="inline" {...Code.parseCodeProps(props)} />
```

#### After

```tsx
pre: (props) => <Code {...props} />
code: (props) => <Code variant="inline" {...props} />
```

The individual `CodeBlock` and `CodeInline` prop types are now grouped under a `CodeComponents` type:

```ts
import type { CodeComponents } from 'renoun'

type BlockProps = CodeComponents['Block']
type BlockContainerProps = CodeComponents['BlockContainer']
type InlineRootProps = CodeComponents['InlineRoot']
```

Inline overrides no longer expose the `Container` or `Fallback` components—layout and fallback rendering are handled automatically by the namespace.
