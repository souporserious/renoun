import React, { cache } from 'react'
import { readFile } from 'node:fs/promises'
import type { SourceFile } from 'ts-morph'
import { Identifier, SyntaxKind } from 'ts-morph'
import { getHighlighter, type Theme } from './highlighter'
import { project } from './project'

export type CodeProps = {
  /** Code snippet to be highlighted. */
  value?: string

  /** Name of the file. */
  filename?: string

  /** Language of the code snippet. */
  language?: string

  /** VS Code-based theme for highlighting. */
  theme?: Theme
}

const loadTypeDeclarations = cache(async () => {
  const typeDeclarations = JSON.parse(
    await readFile(`.next/static/mdxts/types.json`, 'utf8')
  )

  typeDeclarations.forEach(({ path, code }) => {
    project.createSourceFile(path, code, { overwrite: true })
  })
})

let filenameId = 0

/** Renders a code block with syntax highlighting. */
export async function Code({
  value,
  filename: filenameProp,
  language = 'bash',
  theme,
  ...props
}: CodeProps) {
  const filename = filenameProp ?? `index.${filenameId++}.tsx`
  const highlighter = await getHighlighter({ theme })
  let sourceFile: SourceFile

  if (['js', 'jsx', 'ts', 'tsx', 'mdx'].includes(language)) {
    await loadTypeDeclarations()

    sourceFile = project.createSourceFile(filename, value, { overwrite: true })
  }

  const tokens = highlighter(value, language, sourceFile)
  const identifierBounds = sourceFile ? getIdentifierBounds(sourceFile, 20) : []

  return (
    <div
      style={{
        color: theme.colors['editor.color'],
        backgroundColor: theme.colors['editor.background'],
        borderRadius: 4,
      }}
    >
      <pre
        style={{
          gridArea: '1 / 1',
          fontSize: 14,
          lineHeight: '20px',
          padding: 0,
          margin: 0,
          position: 'relative',
          pointerEvents: 'none',
        }}
        {...props}
      >
        {identifierBounds.map((bounds, index) => {
          return (
            <div
              key={index}
              style={{
                position: 'absolute',
                top: bounds.top,
                left: bounds.left,
                width: bounds.width,
                height: bounds.height,
                backgroundColor: '#87add73d',
              }}
            />
          )
        })}
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
    </div>
  )
}

function getIdentifierBounds(sourceFile: SourceFile, lineHeight: number) {
  const identifiers = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)
  const bounds = identifiers
    .filter((identifier) => {
      const parent = identifier.getParent()
      return !Identifier.isJSDocTag(parent) && !Identifier.isJSDoc(parent)
    })
    .map((identifier) => {
      const { line, column } = sourceFile.getLineAndColumnAtPos(
        identifier.getStart()
      )

      return {
        top: (line - 1) * lineHeight,
        left: `calc(${column - 1} * 1ch)`,
        width: `calc(${identifier.getWidth()} * 1ch)`,
        height: lineHeight,
      }
    })

  return bounds
}
