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

  let boxes = []

  if (sourceFile) {
    boxes = getIdentifierBoxes(sourceFile, { width: 8.45, height: 20 })
  }

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
        {boxes.map((box, index) => {
          return (
            <div
              key={index}
              style={{
                position: 'absolute',
                top: box.top,
                left: box.left,
                width: box.width,
                height: box.height,
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

function getIdentifierBoxes(
  sourceFile: SourceFile,
  charDimensions: { width: number; height: number }
) {
  const identifiers = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)
  const boxes = identifiers
    .filter((identifier) => {
      const parent = identifier.getParent()
      return !Identifier.isJSDocTag(parent) && !Identifier.isJSDoc(parent)
    })
    .map((identifier) => {
      const startPos = identifier.getStart()
      const startLineCol = sourceFile.getLineAndColumnAtPos(startPos)

      return {
        top: (startLineCol.line - 1) * charDimensions.height,
        left: (startLineCol.column - 1) * charDimensions.width,
        width: identifier.getWidth() * charDimensions.width,
        height: charDimensions.height,
      }
    })

  return boxes
}
