import React from 'react'
import { CodeBlock, LineNumbers, Tokens, Toolbar } from 'renoun/components'

export function Basic() {
  return (
    <CodeBlock
      source="./counter/useCounter.ts"
      workingDirectory={import.meta.url}
    />
  )
}

export function TypeChecking() {
  return (
    <CodeBlock language="ts" allowCopy={false} allowErrors showErrors>
      const a = 1; a + b;
    </CodeBlock>
  )
}

export function Ordered() {
  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <CodeBlock filename="01.example.ts">const a = 1;</CodeBlock>
      <CodeBlock filename="02.example.ts">const a = 1; const b = 2;</CodeBlock>
    </div>
  )
}

export function LineNumbering() {
  return (
    <CodeBlock filename="line-numbers.ts" showLineNumbers highlightedLines="4">
      {`const a = 1;\nconst b = 2;\n\nconst add = a + b\nconst subtract = a - b`}
    </CodeBlock>
  )
}

export function LineHighlighting() {
  return (
    <CodeBlock filename="line-highlight.ts" highlightedLines="2, 4">
      {`const a = 1;\nconst b = 2;\n\nconst add = a + b\nconst subtract = a - b`}
    </CodeBlock>
  )
}

export function LineFocusing() {
  return (
    <CodeBlock filename="line-focus.ts" focusedLines="2, 4">
      {`const a = 1;\nconst b = 2;\n\nconst add = a + b\nconst subtract = a - b`}
    </CodeBlock>
  )
}

export function LineHighlightAndFocus() {
  return (
    <CodeBlock
      filename="line-highlight-and-focus.ts"
      highlightedLines="2, 4"
      focusedLines="2, 4"
    >
      {`const a = 1;\nconst b = 2;\n\nconst add = a + b\nconst subtract = a - b`}
    </CodeBlock>
  )
}

export function TokensOnly() {
  return <Tokens language="ts">const a = '1'; const b = '2'; a + b;</Tokens>
}

export function CustomStyles() {
  return (
    <CodeBlock
      allowErrors="2307"
      filename="toolbar.tsx"
      source="./counter/Counter.tsx"
      workingDirectory={import.meta.url}
    >
      <div
        style={{
          fontSize: '1rem',
          borderRadius: '0.25rem',
          boxShadow: '0 0 0 1px var(--color-separator)',
        }}
      >
        <Toolbar
          allowCopy
          css={{
            padding: '0.5lh',
            boxShadow: 'inset 0 -1px 0 0 var(--color-separator)',
          }}
        />
        <pre
          style={{
            display: 'grid',
            gridTemplateColumns: 'min-content max-content',
            padding: '0.5lh 0',
            lineHeight: 1.4,
            whiteSpace: 'pre',
            wordWrap: 'break-word',
            overflow: 'auto',
          }}
        >
          <LineNumbers
            css={{
              padding: '0 0.5lh',
              backgroundColor: 'var(--color-background)',
            }}
          />
          <code style={{ paddingRight: '0.5lh' }}>
            <Tokens />
          </code>
        </pre>
      </div>
    </CodeBlock>
  )
}
