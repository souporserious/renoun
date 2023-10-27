import React, { cache } from 'react'
import { readFile } from 'node:fs/promises'
import type { SourceFile } from 'ts-morph'
import { getHighlighter, type Theme } from './highlighter'
import { project } from './project'
import { CodeView } from './CodeView'

export type CodeProps = {
  /** Code snippet to be highlighted. */
  value?: string

  /** Name of the file. */
  filename?: string

  /** Language of the code snippet. */
  language?: string

  /** Show or hide line numbers. */
  lineNumbers?: boolean

  /** Lines to highlight. */
  highlight?: string

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
  lineNumbers,
  highlight,
  theme,
}: CodeProps) {
  const filename = filenameProp ?? `index.${filenameId++}.tsx`
  const highlighter = await getHighlighter({ theme })
  let sourceFile: SourceFile

  if (['js', 'jsx', 'ts', 'tsx', 'mdx'].includes(language)) {
    await loadTypeDeclarations()

    sourceFile = project.createSourceFile(filename, value, { overwrite: true })
  }

  const tokens = highlighter(value, language, sourceFile)

  return (
    <CodeView
      tokens={tokens}
      lineNumbers={lineNumbers}
      sourceFile={sourceFile}
      filename={filename}
      highlighter={highlighter}
      highlight={highlight}
      language={language}
      theme={theme}
    />
  )
}
