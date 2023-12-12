import React from 'react'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import type { SourceFile } from 'ts-morph'
import { findRoot } from '@manypkg/find-root'
import { format, resolveConfig } from 'prettier'
import { getSourcePath } from '../utils/get-source-path'
import { isJsxOnly } from '../utils/is-jsx-only'
import { getHighlighter, type Theme } from './highlighter'
import { project } from './project'
import { CodeView } from './CodeView'
import { registerCodeComponent } from './state'

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

  /** Show or hide errors. */
  showErrors?: boolean

  /** Whether or not to allow errors. */
  allowErrors?: boolean

  /** Padding to apply to the code block. */
  padding?: string

  /** Horizontal padding to apply to the code block. */
  paddingHorizontal?: string

  /** Vertical padding to apply to the code block. */
  paddingVertical?: string

  /** Whether or not the code is presented inline or as a block-level element. Note, extra white space will be trimmed when enabled. */
  inline?: boolean

  /** Class name to apply to the code block. */
  className?: string
}

export type CodeProps =
  | ({
      /** Code snippet to be highlighted. */
      value: string
    } & BaseCodeProps)
  | ({
      /** Source code to be highlighted. */
      source: string

      /** Specify the working directory for the `source`. */
      workingDirectory?: string
    } & BaseCodeProps)

type PrivateCodeProps = Partial<{
  /** Line to scroll to. */
  line: number

  /** Path to the source file on disk. */
  sourcePath: string

  /** Whether the code block is nested in the Editor component. */
  isNestedInEditor: boolean
}>

const languageMap = {
  shell: 'shellscript',
  mjs: 'javascript',
}
let filenameId = 0

/** Renders a code block with syntax highlighting. */
export async function Code({
  filename: filenameProp,
  language,
  lineNumbers,
  highlight,
  theme,
  className,
  showErrors,
  allowErrors,
  padding,
  paddingHorizontal,
  paddingVertical,
  inline,
  ...props
}: CodeProps) {
  const { isNestedInEditor, sourcePath, line } = props as PrivateCodeProps
  const id = 'source' in props ? props.source : filenameProp ?? filenameId++
  const unregisterCodeComponent = registerCodeComponent(id)

  let finalValue
  let finalLanguage = languageMap[language] || language || 'bash'

  if ('value' in props) {
    finalValue = props.value
  }

  if ('source' in props) {
    if (!props.workingDirectory) {
      throw new Error(
        'The [workingDirectory] prop is required when using the [source] prop in the Code component.'
      )
    }

    const sourcePath = join(props.workingDirectory, props.source)
    finalValue = await readFile(sourcePath, 'utf-8')
    finalLanguage = sourcePath.split('.').pop()
  }

  const isJavaScriptLanguage = ['js', 'jsx', 'ts', 'tsx'].includes(
    finalLanguage
  )
  const jsxOnly = isJavaScriptLanguage ? isJsxOnly(finalValue) : false
  let filename = 'source' in props ? props.source : filenameProp
  let sourceFile: SourceFile

  if (!filename) {
    filename = `${id}.${finalLanguage}`
  }

  // Format JavaScript code blocks.
  if (isJavaScriptLanguage) {
    const config = await resolveConfig(filename)
    config.filepath = filename
    config.printWidth = 60
    finalValue = await format(finalValue, config)

    // Trim semicolon and trailing newline from formatting.
    if (jsxOnly) {
      finalValue = finalValue.trimEnd()

      if (finalValue.startsWith(';')) {
        finalValue = finalValue.slice(1)
      }
    }
  }

  // Trim extra whitespace from inline code blocks since it's difficult to read.
  if (inline) {
    finalValue = finalValue.replace(/\s+/g, ' ')
  }

  // Scope code block source files since they can conflict with other files on disk.
  if ('value' in props) {
    filename = `mdxts/${filename}`
  }

  if (isJavaScriptLanguage) {
    sourceFile = project.createSourceFile(filename, finalValue, {
      overwrite: true,
    })

    sourceFile.fixMissingImports()
  }

  unregisterCodeComponent()

  const highlighter = await getHighlighter({ theme })
  const tokens = highlighter(finalValue, finalLanguage, sourceFile, jsxOnly)
  const rootDirectory = (await findRoot(process.cwd())).rootDir
  const baseDirectory = process.cwd().replace(rootDirectory, '')

  return (
    <CodeView
      tokens={tokens}
      lineNumbers={lineNumbers}
      value={finalValue}
      sourceFile={sourceFile}
      sourcePath={
        sourceFile ? getSourcePath(sourceFile.getFilePath()) : undefined
      }
      filename={filename}
      shouldRenderFilename={Boolean(filenameProp)}
      highlighter={highlighter}
      highlight={highlight}
      language={finalLanguage}
      padding={padding}
      paddingHorizontal={paddingHorizontal}
      paddingVertical={paddingVertical}
      inline={inline}
      theme={theme}
      isJsxOnly={jsxOnly}
      isNestedInEditor={isNestedInEditor}
      showErrors={showErrors}
      allowErrors={allowErrors}
      className={className}
      rootDirectory={rootDirectory}
      baseDirectory={baseDirectory}
      edit={
        process.env.NODE_ENV === 'development'
          ? async function () {
              'use server'
              const sourceLine = line
              const contents = await readFile(sourcePath, 'utf-8')
              const modifiedContents = contents
                .split('\n')
                .map((_line, index) => {
                  if (index === sourceLine - 1) {
                    return _line.includes('showErrors')
                      ? _line.replace('showErrors', '')
                      : `${_line.trimEnd()} showErrors`
                  }
                  return _line
                })
                .join('\n')

              writeFile(sourcePath, modifiedContents)
            }
          : undefined
      }
    />
  )
}
