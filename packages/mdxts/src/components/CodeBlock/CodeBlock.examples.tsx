import React from 'react'
import { getThemeColors } from '../../index'
import { CodeBlock } from './CodeBlock'
import { LineNumbers } from './LineNumbers'
import { Tokens } from './Tokens'
import { Toolbar } from './Toolbar'

export function Basic() {
  return <CodeBlock source="./counter/useCounter.ts" />
}

export function TypeChecking() {
  return (
    <CodeBlock
      value={`const a = 1; a + b;`}
      language="ts"
      allowErrors
      showErrors
    />
  )
}

export function Ordered() {
  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <CodeBlock filename="01.example.ts" value="const a = 1;" />
      <CodeBlock filename="02.example.ts" value="const a = 1; const b = 2;" />
    </div>
  )
}

export function LineNumbering() {
  return (
    <CodeBlock
      filename="line-numbers.ts"
      value={`const a = 1;\nconst b = 2;\n\nconst add = a + b\nconst subtract = a - b`}
      lineNumbers
      lineHighlights="4"
    />
  )
}

export function LineHighlighting() {
  return (
    <CodeBlock
      filename="line-highlights.ts"
      value={`const a = 1;\nconst b = 2;\n\nconst add = a + b\nconst subtract = a - b`}
      lineHighlights="1-2, 4"
    />
  )
}

export async function WithToolbar() {
  const theme = await getThemeColors()

  return (
    <CodeBlock
      allowErrors="2307"
      filename="toolbar.tsx"
      source="./counter/Counter.tsx"
    >
      <div
        style={{
          color: theme.foreground,
          backgroundColor: theme.background,
          border: `1px solid ${theme.panel.border}70`,
        }}
      >
        <Toolbar allowCopy style={{ padding: '0.5rem 1rem' }} />
        <pre
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            padding: '1rem 0',
            lineHeight: 1.4,
            whiteSpace: 'pre',
            wordWrap: 'break-word',
            overflow: 'auto',
          }}
        >
          <LineNumbers
            style={{ padding: '0 1rem', backgroundColor: theme.background }}
          />
          <div>
            <Tokens />
          </div>
        </pre>
      </div>
    </CodeBlock>
  )
}
