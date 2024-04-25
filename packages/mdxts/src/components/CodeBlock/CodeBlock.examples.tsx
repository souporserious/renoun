import React from 'react'
import { getTheme } from '../../index'
import { CodeBlock } from './CodeBlock'
import { LineHighlights } from './LineHighlights'
import { LineNumbers } from './LineNumbers'
import { Tokens } from './Tokens'
import { Toolbar } from './Toolbar'

export function Basic() {
  return <CodeBlock source="./counter/useCounter.ts" />
}

export function TypeChecking() {
  return <CodeBlock value={`const a = 1; a + b;`} language="ts" />
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
  const theme = getTheme()
  const highlight = '4'

  return (
    <CodeBlock
      filename="line-numbers.ts"
      value={`const a = 1;\nconst b = 2;\n\nconst add = a + b\nconst subtract = a - b`}
    >
      <pre
        style={{
          display: 'flex',
          padding: '1ch',
          lineHeight: 1.4,
          whiteSpace: 'pre',
          wordWrap: 'break-word',
          backgroundColor: theme.background,
          color: theme.foreground,
          boxShadow: `0 0 0 1px ${theme.colors['panel.border']}70`,
          borderRadius: 5,
          position: 'relative',
        }}
      >
        <LineNumbers
          highlightRanges={highlight}
          style={{ width: '4ch', paddingRight: '1ch' }}
        />
        <div style={{ flex: 1, overflow: 'auto' }}>
          <Tokens />
        </div>
        <LineHighlights highlightRanges={highlight} offsetTop="1ch" />
      </pre>
    </CodeBlock>
  )
}

export function LineHighlighting() {
  return (
    <CodeBlock
      filename="line-highlights.ts"
      value={`const a = 1;\nconst b = 2;\n\nconst add = a + b\nconst subtract = a - b`}
    >
      <pre
        style={{
          padding: '1rem',
          lineHeight: 1.4,
          whiteSpace: 'pre',
          wordWrap: 'break-word',
          overflow: 'auto',
          position: 'relative',
        }}
      >
        <Tokens />
        <LineHighlights highlightRanges="1-2, 4" offsetTop="1rem" />
      </pre>
    </CodeBlock>
  )
}

export function WithToolbar() {
  const theme = getTheme()

  return (
    <CodeBlock
      allowErrors="2307"
      filename="toolbar.tsx"
      source="./counter/Counter.tsx"
    >
      <div
        style={{
          backgroundColor: theme.background,
          color: theme.foreground,
          boxShadow: `0 0 0 1px ${theme.colors['panel.border']}70`,
          borderRadius: 5,
        }}
      >
        <Toolbar allowCopy style={{ padding: '0.5rem 1rem' }} />
        <pre
          style={{
            lineHeight: 1.4,
            whiteSpace: 'pre',
            wordWrap: 'break-word',
            overflow: 'auto',
            position: 'relative',
          }}
        >
          <Tokens />
        </pre>
      </div>
    </CodeBlock>
  )
}
