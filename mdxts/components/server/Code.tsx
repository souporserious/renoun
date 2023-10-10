import * as React from 'react'
import { getHighlighter } from '../highlighter'
import { project } from '../project'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export type CodeProps = {
  /** Code snippet to be highlighted. */
  value?: string

  /** Language of the code snippet. */
  language?: string

  /** VS Code-based theme for highlighting. */
  theme?: Parameters<typeof getHighlighter>[0]['theme']
}

const nextDirectory = process.env.NODE_ENV === 'production' ? '_next' : '.next'
let id = 0

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
    paths: {
      languages: resolve(process.cwd(), `${nextDirectory}/static/mdxts`),
    },
  })
  const typeDeclarations = JSON.parse(
    await readFile(
      resolve(process.cwd(), `${nextDirectory}/static/mdxts/types.json`),
      'utf8'
    )
  )

  typeDeclarations.forEach(({ path, code }) => {
    project.createSourceFile(path, code, { overwrite: true })
  })

  const sourceFile = project.createSourceFile(`index-${id++}.tsx`, value)
  const diagnostics = sourceFile.getPreEmitDiagnostics()
  const tokens = highlighter(value, language, diagnostics)

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
