import * as React from 'react'
import { highlight } from '@code-hike/lighter'

type CodeProps = {
  language?: string
  value?: string
  theme?: Record<string, unknown>
}

async function AsyncCode({
  language = 'bash',
  value,
  theme,
  ...props
}: CodeProps) {
  const { lines } = await highlight(value.trim(), language, theme)

  return (
    <pre style={{ gridArea: '1 / 1', margin: 0 }} {...props}>
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

/** Renders a code block with syntax highlighting. */
export function Code(props: CodeProps) {
  return <AsyncCode {...props} />
}
