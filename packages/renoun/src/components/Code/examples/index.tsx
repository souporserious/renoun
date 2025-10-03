import { Code } from 'renoun'

export function Basic() {
  return <Code language="ts">{`const beep = 'boop'`}</Code>
}

export function TypeChecking() {
  return (
    <Code language="ts" allowCopy={false} allowErrors showErrors>
      {`const a = 1; a + b;`}
    </Code>
  )
}

export function Ordered() {
  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <Code path="01.example.ts">{`const a = 1;`}</Code>
      <Code path="02.example.ts">{`const a = 1; const b = 2;`}</Code>
    </div>
  )
}

export function LineNumbering() {
  return (
    <Code path="line-numbers.ts" showLineNumbers highlightedLines="4">
      {`const a = 1;\nconst b = 2;\n\nconst add = a + b\nconst subtract = a - b`}
    </Code>
  )
}

export function LineHighlighting() {
  return (
    <Code path="line-highlight.ts" highlightedLines="2, 4">
      {`const a = 1;\nconst b = 2;\n\nconst add = a + b\nconst subtract = a - b`}
    </Code>
  )
}

export function LineFocusing() {
  return (
    <Code path="line-focus.ts" focusedLines="2, 4">
      {`const a = 1;\nconst b = 2;\n\nconst add = a + b\nconst subtract = a - b`}
    </Code>
  )
}

export function LineHighlightAndFocus() {
  return (
    <Code
      path="line-highlight-and-focus.ts"
      highlightedLines="2, 4"
      focusedLines="2, 4"
    >
      {`const a = 1;\nconst b = 2;\n\nconst add = a + b\nconst subtract = a - b`}
    </Code>
  )
}

export function Inline() {
  return (
    <p>
      In React,{' '}
      <Code variant="inline" language="jsx">
        {`<span style={{ color: 'blue' }} />`}
      </Code>{' '}
      changes the color of the text to blue.
    </p>
  )
}

export function InlineCopy() {
  return (
    <Code
      variant="inline"
      allowCopy
      language="sh"
      components={{
        Root: ({ className, copyButton, children }) => (
          <code className={className} style={{ padding: '0.5em 0.8em 0' }}>
            {children}
            {copyButton}
          </code>
        ),
      }}
    >
      npx create-renoun
    </Code>
  )
}

export function TokensOnly() {
  return (
    <pre>
      <Code.Tokens language="ts">{`const a = 1\nconst b = 2\na + b`}</Code.Tokens>
    </pre>
  )
}

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'

const directoryPath = dirname(fileURLToPath(import.meta.url))

export async function CustomStyles() {
  const code = await readFile(
    join(directoryPath, './counter/Counter.tsx'),
    'utf-8'
  )

  return (
    <Code.Provider
      value={{
        filePath: './counter/Counter.tsx',
        baseDirectory: directoryPath,
      }}
    >
      <div
        style={{
          fontSize: '1rem',
          borderRadius: '0.25rem',
          boxShadow: '0 0 0 1px var(--color-separator)',
        }}
      >
        <Code.Toolbar
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
          <Code.LineNumbers
            css={{
              padding: '0 0.5lh',
              backgroundColor: 'var(--color-background)',
            }}
          />
          <code style={{ paddingRight: '0.5lh' }}>
            <Code.Tokens>{code}</Code.Tokens>
          </code>
        </pre>
      </div>
    </Code.Provider>
  )
}
