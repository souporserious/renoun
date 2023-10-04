import * as React from 'react'
import { highlight } from '@code-hike/lighter'
import type { getHighlighter } from 'shiki'

export type CodeProps = {
  /** Code snippet to be highlighted. */
  value?: string

  /** Language of the code snippet. */
  language?: string

  /** VS Code-based theme for highlighting. */
  theme?: Parameters<typeof getHighlighter>[0]['theme']
}

/** Renders a code block with syntax highlighting. */
export async function Code({
  value,
  language = 'bash',
  theme,
  ...props
}: CodeProps) {
  const { lines, style } = await highlight(value, language, theme as any)

  return (
    <pre style={{ gridArea: '1 / 1', margin: 0, ...style }} {...props}>
      {lines.map((line, index) => (
        <div key={index} style={{ height: 20, lineHeight: '20px' }}>
          {line.map((token, index) => (
            <span key={index} style={token.style}>
              {token.content}
            </span>
          ))}
        </div>
      ))}
    </pre>
  )
}
