import * as React from 'react'
import { readFile } from 'node:fs/promises'
import { highlight } from '@code-hike/lighter'

type CodeProps = {
  language?: string
  value?: string
}

/** Renders a code block with syntax highlighting. */
export async function Code({ language = 'bash', value, ...props }: CodeProps) {
  const { lines } = await highlight(
    value,
    language,
    JSON.parse(await readFile(process.env.MDXTS_THEME_PATH, 'utf-8'))
  )

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
