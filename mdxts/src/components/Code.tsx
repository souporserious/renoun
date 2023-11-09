import React, { cache } from 'react'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { SourceFile } from 'ts-morph'
import { getHighlighter, type Theme } from './highlighter'
import { project } from './project'
import { CodeView } from './CodeView'

export type BaseCodeProps = {
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

export type CodeProps =
  | ({
      /** Code snippet to be highlighted. */
      value?: string
    } & BaseCodeProps)
  | ({
      /** Source code to be highlighted. */
      source?: string

      /** Specify the working directory for the [source]. */
      workingDirectory?: string
    } & BaseCodeProps)

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
  filename: filenameProp,
  language,
  lineNumbers,
  highlight,
  theme,
  ...props
}: CodeProps) {
  let finalValue
  let finalLanguage = language

  if ('value' in props) {
    finalValue = props.value
  }

  if ('source' in props) {
    const sourcePath = join(props.workingDirectory ?? '', props.source ?? '')
    finalValue = await readFile(sourcePath, 'utf-8')
    finalLanguage = sourcePath.split('.').pop()
  }

  const filename = filenameProp ?? `${filenameId++}.${finalLanguage}`
  const highlighter = await getHighlighter({ theme })
  let sourceFile: SourceFile

  if (['js', 'jsx', 'ts', 'tsx', 'mdx'].includes(finalLanguage)) {
    await loadTypeDeclarations()

    sourceFile = project.createSourceFile(filename, finalValue, {
      overwrite: true,
    })
  }

  const tokens = highlighter(finalValue, finalLanguage, sourceFile)

  return (
    <CodeView
      tokens={tokens}
      lineNumbers={lineNumbers}
      sourceFile={sourceFile}
      filename={filename}
      highlighter={highlighter}
      highlight={highlight}
      language={finalLanguage}
      theme={theme}
    />
  )
}
