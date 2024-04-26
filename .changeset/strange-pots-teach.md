---
'mdxts': minor
---

Rewrites the `CodeBlock` component to use the latest version of [shiki](https://shiki.style/) as well as allows for better composition using newly exposed `Tokens`, `Toolbar`, `LineNumbers`, and `LineHighlights` components:

```tsx
import { getTheme } from 'mdxts'
import { CodeBlock, Toolbar, Tokens } from 'mdxts/components'

function CodeBlockWithToolbar() {
  const theme = getTheme()

  return (
    <CodeBlock source="./counter/Counter.tsx">
      <div
        style={{
          backgroundColor: theme.background,
          color: theme.foreground,
        }}
      >
        <Toolbar allowCopy style={{ padding: '0.5rem 1rem' }} />
        <pre
          style={{
            whiteSpace: 'pre',
            wordWrap: 'break-word',
            overflow: 'auto',
          }}
        >
          <Tokens />
        </pre>
      </div>
    </CodeBlock>
  )
}
```

Individual `CodeBlock` elements can be styled now for simple overriding:

```tsx
<CodeBlock
  className={{
    container: GeistMono.className,
  }}
  style={{
    container: {
      fontSize: 'var(--font-size-body-2)',
      lineHeight: 'var(--line-height-body-2)',
      padding: '1rem',
    },
    toolbar: {
      padding: '0.5rem 1rem',
    },
  }}
  language="tsx"
  value="..."
/>
```

### Breaking Changes

`CodeBlock` now uses a keyed `className` and `style` object to allow for more granular control over the styling of the `CodeBlock` components. To upgrade, move the `className` and `style` definitions to target the `container`:

```diff
<CodeBlock
--  className={GeistMono.className}
++  className={{ container: GeistMono.className }}
style={{
++    container: {
           padding: '1rem'
++    },
  }}
```
