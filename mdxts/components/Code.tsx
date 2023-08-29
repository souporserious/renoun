import * as React from 'react'
import { readFile } from 'node:fs/promises'
import { highlight } from '@code-hike/lighter'

type CodeProps = {
  language?: string
  value?: string
}

async function AsyncCode({ language = 'bash', value, ...props }: CodeProps) {
  try {
    const { lines } = await highlight(
      value.trim(),
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
  } catch (error) {
    throw new Error(
      `${process.cwd()}, attempting to load: ${process.env.MDXTS_THEME_PATH}`,
      { cause: error }
    )
  }
}

/** Renders a code block with syntax highlighting. */
export function Code(props: CodeProps) {
  return <AsyncCode {...props} />
}
