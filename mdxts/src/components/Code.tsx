import React from 'react'
import { join } from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import type { SourceFile } from 'ts-morph'
import { findRoot } from '@manypkg/find-root'
import { format, resolveConfig } from 'prettier'
import 'server-only'

import { getTheme } from '../index'
import { getSourcePath } from '../utils/get-source-path'
import { isJsxOnly } from '../utils/is-jsx-only'
import { getHighlighter, type Theme } from './highlighter'
import { project } from './project'
import { CodeView } from './CodeView'
import { registerCodeComponent } from './state'

export { getMetadataFromClassName } from '../utils/get-metadata-from-class-name'

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

  /** Show or hide the copy button. */
  allowCopy?: boolean

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
  /** Path to the source file on disk provided by the remark plugin. */
  sourcePath: string
  sourcePathLine: number
  sourcePathColumn: number

  /** Whether the code block is nested in the Editor component. */
  isNestedInEditor: boolean
}>

const languageMap: Record<string, any> = {
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
  theme: themeProp,
  className,
  showErrors,
  allowErrors,
  allowCopy,
  padding,
  paddingHorizontal,
  paddingVertical,
  inline,
  ...props
}: CodeProps) {
  const { isNestedInEditor, sourcePath, sourcePathLine, sourcePathColumn } =
    props as PrivateCodeProps
  const theme = themeProp ?? getTheme()

  if (!theme) {
    throw new Error(
      'The [theme] prop was not provided to the [Code] component. Pass an explicit theme or make sure the mdxts/loader package is configured correctly.'
    )
  }

  const id = 'source' in props ? props.source : filenameProp ?? filenameId++
  const unregisterCodeComponent = registerCodeComponent(id)

  let finalValue: string = ''
  let finalLanguage =
    language && language in languageMap
      ? languageMap[language]
      : language || 'bash'

  if ('value' in props) {
    finalValue = props.value
  }

  if ('source' in props) {
    if (!props.workingDirectory) {
      throw new Error(
        'The [workingDirectory] prop was not provided to the [Code] component. Make sure the mdxts/remark plugin and mdxts/loader are configured correctly.'
      )
    }

    const sourcePropPath = join(props.workingDirectory, props.source)
    finalValue = await readFile(sourcePropPath, 'utf-8')
    finalLanguage = sourcePropPath.split('.').pop()
  }

  const isJavaScriptLanguage = ['js', 'jsx', 'ts', 'tsx'].includes(
    finalLanguage
  )
  const jsxOnly =
    !inline && isJavaScriptLanguage ? isJsxOnly(finalValue) : false
  let filename = 'source' in props ? props.source : filenameProp
  let sourceFile: SourceFile | undefined

  if (!filename) {
    filename = `${id}.${finalLanguage}`
  }

  // Format JavaScript code blocks.
  if (isJavaScriptLanguage) {
    try {
      const config = (await resolveConfig(filename)) || {}
      config.filepath = filename
      config.printWidth = 80
      finalValue = await format(finalValue, config)
    } catch (error) {
      // Ignore formatting errors.
    }

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
        sourcePath
          ? getSourcePath(sourcePath, sourcePathLine, sourcePathColumn)
          : undefined
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
      allowCopy={allowCopy}
      className={className}
      rootDirectory={rootDirectory}
      baseDirectory={baseDirectory}
      edit={
        process.env.NODE_ENV === 'development'
          ? async function () {
              'use server'
              if (!sourcePath || !sourcePathLine) {
                throw new Error(
                  'The [sourcePath] prop was not provided to the [Code] component. Make sure the mdxts/remark plugin is configured correctly.'
                )
              }
              const contents = await readFile(sourcePath, 'utf-8')
              const modifiedContents = contents
                .split('\n')
                .map((_line, index) => {
                  if (index === sourcePathLine - 1) {
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
