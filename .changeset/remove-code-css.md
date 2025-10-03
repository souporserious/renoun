---
'renoun': minor
---

### Breaking Change

Remove the `css`, `className`, `style`, `paddingX`, and `paddingY` props from the `Code` namespace. Use the `components` prop to customize inline and block variants via the new container, pre, code, and inline root override points.

The standalone `CodeBlock` and `CodeInline` exports have also been removed. Use the unified `Code` component instead:

```tsx
// before
import { CodeBlock, CodeInline } from 'renoun'

<CodeBlock language="ts">{`const a = 1`}</CodeBlock>
<CodeInline allowCopy>{`npm create renoun`}</CodeInline>

// after
import { Code } from 'renoun'

<Code language="ts">{`const a = 1`}</Code>
<Code variant="inline" allowCopy>{`npm create renoun`}</Code>
```

If you rely on the MDX `CodeBlock` slot, map it to the block variant instead of re-exporting the removed component:

```tsx
import { Code } from 'renoun'

export function useMDXComponents() {
  return {
    CodeBlock: Code,
  }
}

```

Custom MDX renderers no longer need to call `Code.parsePreProps` or `Code.parseCodeProps`. Pass the element props directly and the `Code` component will normalize them for you:

```tsx
// before
pre: (props) => <Code {...Code.parsePreProps(props)} />
code: (props) => <Code variant="inline" {...Code.parseCodeProps(props)} />

// after
pre: (props) => <Code {...props} />
code: (props) => <Code variant="inline" {...props} />
```

The individual `CodeBlock*`/`CodeInline*` prop types are now grouped under a `CodeComponents` helper. Reach for these indexed props instead of importing each interface directly:

```ts
import type { CodeComponents } from 'renoun'

type BlockProps = CodeComponents['Block']
type BlockContainerProps = CodeComponents['BlockContainer']
type InlineRootProps = CodeComponents['InlineRoot']
```

Inline overrides no longer expose the `Container` or `Fallback` components—layout and fallback rendering are handled automatically by the namespace.

The `Command` component also moves away from `css`/`className`/`style` overrides. Swap sub-components through the new `components` prop, which is typed via `CommandComponents` so you can reference individual prop types when re-implementing pieces of the UI:

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

Reach for the indexed helpers (e.g. `CommandComponents['TabPanel']`) when you need individual prop types. For inline snippets rendered via `<Command variant={undefined}>`, pass the inline overrides directly through `components.Code`.
