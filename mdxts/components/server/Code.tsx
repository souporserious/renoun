import * as React from 'react'
import { getHighlighter } from '../client/highlighter'

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
  const highlighter = await getHighlighter({
    theme,
    langs: [
      'javascript',
      'jsx',
      'typescript',
      'tsx',
      'css',
      'json',
      'shellscript',
    ],
  })
  const tokens = highlighter(value, language)

  return (
    <pre
      style={{
        gridArea: '1 / 1',
        fontSize: 14,
        lineHeight: '20px',
        padding: 0,
        margin: 0,
      }}
      {...props}
    >
      {tokens.map((line, lineIndex) => {
        return (
          <div key={lineIndex} style={{ height: 20 }}>
            {line.map((token, tokenIndex) => {
              return (
                <span
                  key={tokenIndex}
                  style={{
                    ...token.fontStyle,
                    color: token.color,
                    textDecoration: token.hasError
                      ? 'red wavy underline'
                      : 'none',
                  }}
                >
                  {token.content}
                </span>
              )
            })}
          </div>
        )
      })}
    </pre>
  )
}
