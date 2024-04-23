import React from 'react'
import { CodeBlock } from './CodeBlock'

export function Basic() {
  return <CodeBlock source="./counter/useCounter.ts" />
}

export function Ordered() {
  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <CodeBlock filename="01.example.ts" value="const a = 1;" />
      <CodeBlock filename="02.example.ts" value="const a = 1; const b = 2;" />
    </div>
  )
}

export function HighlightLines() {
  return (
    <CodeBlock
      filename="line-highlights.ts"
      value={`const a = 1;\nconst b = 2;\n\nconst add = a + b\nconst subtract = a - b`}
      highlight="1-2, 4"
    />
  )
}
