import React from 'react'
import crypto from 'node:crypto'
import { join, sep, isAbsolute } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { SourceFile } from 'ts-morph'
import { findRoot } from '@manypkg/find-root'
import { format, resolveConfig } from 'prettier'
import { BUNDLED_LANGUAGES } from 'shiki'
import 'server-only'

import { getTheme } from '../index'
import { getContext } from '../utils/context'
import { getSourcePath } from '../utils/get-source-path'
import { isJsxOnly } from '../utils/is-jsx-only'
import { Context } from './Context'
import { getHighlighter, type Theme } from './highlighter'
import { project } from './project'
import { CodeView } from './CodeView'

export { getClassNameMetadata } from '../utils/get-class-name-metadata'

const languageMap: Record<string, any> = {
  mjs: 'javascript',
}
const languageKeys = Object.keys(languageMap)

type SHIKI_LANGUAGE =
  | (typeof BUNDLED_LANGUAGES)[number]
  | (typeof languageKeys)[number]

export type BaseCodeBlockProps = {
  /** Name of the file. */
  filename?: string

  /** Language of the code snippet. */
  language?: SHIKI_LANGUAGE

  /** Show or hide line numbers. */
  lineNumbers?: boolean

  /** Lines to highlight. */
  highlight?: string

  /** VS Code-based theme for highlighting. */
  theme?: Theme

  /** Show or hide the copy button. */
  allowCopy?: boolean

  /** Whether or not to allow errors. Accepts a boolean or comma-separated list of allowed error codes. */
  allowErrors?: boolean | string

  /** Show or hide errors. */
  showErrors?: boolean

  /** Padding to apply to the code block. */
  padding?: string

  /** Horizontal padding to apply to the code block. */
  paddingHorizontal?: string

  /** Vertical padding to apply to the code block. */
  paddingVertical?: string

  /** Whether or not to show the toolbar. */
  toolbar?: boolean

  /** Class name to apply to the code block. */
  className?: string

  /** Style to apply to the code block. */
  style?: React.CSSProperties
}

export type CodeBlockProps =
  | ({
      /** Code snippet to be highlighted. */
      value: string
    } & BaseCodeBlockProps)
  | ({
      /** Source code to be highlighted. */
      source: string

      /** Specify the working directory for the `source`. */
      workingDirectory?: string
    } & BaseCodeBlockProps)

type PrivateCodeBlockProps = Partial<{
  /** Path to the source file on disk provided by the remark plugin. */
  sourcePath: string
  sourcePathLine: number
  sourcePathColumn: number

  /** Whether the code block is nested in the Editor component. */
  isNestedInEditor: boolean
}>

/** Renders a code block with syntax highlighting. */
export async function CodeBlock({
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
  toolbar = true,
  style,
  ...props
}: CodeBlockProps) {
  const contextValue = getContext(Context)
  const { isNestedInEditor, sourcePath, sourcePathLine, sourcePathColumn } =
    props as PrivateCodeBlockProps
  const theme = themeProp ?? contextValue.theme ?? getTheme()

  if (!theme) {
    throw new Error(
      'The [theme] prop was not provided to the [CodeBlock] component. Pass an explicit theme or make sure the mdxts/loader package is configured correctly.'
    )
  }

  let id = 'source' in props ? props.source : filenameProp

  if ('value' in props && id === undefined) {
    const hex = crypto.createHash('sha256').update(props.value).digest('hex')
    if (hex) {
      id = hex
    }
  }

  let finalValue: string = ''
  let finalLanguage =
    (typeof language === 'string' && language in languageMap
      ? languageMap[language]
      : language) ||
    (filenameProp ? filenameProp.split('.').pop() : 'plaintext')

  if ('value' in props) {
    finalValue = props.value
  } else if ('source' in props) {
    const isRelative = !isAbsolute(props.source)
    const workingDirectory =
      contextValue?.workingDirectory ?? props.workingDirectory

    if (isRelative && !workingDirectory) {
      throw new Error(
        'The [workingDirectory] prop was not provided to the [CodeBlock] component while using a relative path. Pass a valid [workingDirectory] or make sure the mdxts/remark plugin and mdxts/loader are configured correctly if this is being renderend in an MDX file.'
      )
    }

    const sourcePropPath = isRelative
      ? join(workingDirectory!, props.source)
      : props.source

    finalValue = await readFile(sourcePropPath, 'utf-8')
    finalLanguage = sourcePropPath.split('.').pop()
  }

  const isJavaScriptLanguage = ['js', 'jsx', 'ts', 'tsx'].includes(
    finalLanguage
  )
  const jsxOnly = isJavaScriptLanguage ? isJsxOnly(finalValue) : false
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

  // Scope code block source files since they can conflict with other files on disk.
  if ('value' in props) {
    filename = join('mdxts', filename)
  }

  if (isJavaScriptLanguage) {
    try {
      sourceFile = project.createSourceFile(filename, finalValue, {
        overwrite: true,
      })

      sourceFile.fixMissingImports()
    } catch (error) {
      if (error instanceof Error) {
        const workingDirectory =
          contextValue?.workingDirectory ??
          // @ts-expect-error
          props.workingDirectory ??
          process.cwd()
        console.error(
          `mdxts: Error trying to create CodeBlock source file at working directory "${workingDirectory}": ${error.message}`
        )
      }
    }
  }

  const highlighter = await getHighlighter()
  const tokens = highlighter(finalValue, finalLanguage, sourceFile, jsxOnly)
  const rootDirectory = (await findRoot(process.cwd())).rootDir
  const baseDirectory = process.cwd().replace(rootDirectory, '')
  const filenameLabel = filename
    .replace(join('mdxts', sep), '')
    .replace(/\d+\./, '')
  const codeProps: React.ComponentProps<typeof CodeView> = {
    value: finalValue,
    language: finalLanguage,
    isJsxOnly: jsxOnly,
    sourcePath: sourcePath
      ? getSourcePath(sourcePath, sourcePathLine, sourcePathColumn)
      : undefined,
    shouldRenderFilename: Boolean(filenameProp),
    tokens,
    lineNumbers,
    sourceFile,
    filename,
    filenameLabel,
    highlighter,
    highlight,
    padding,
    paddingHorizontal,
    paddingVertical,
    theme,
    isNestedInEditor,
    showErrors,
    allowErrors,
    allowCopy,
    className,
    rootDirectory,
    baseDirectory,
    toolbar,
    style,
  }

  if (process.env.NODE_ENV === 'development') {
    codeProps.edit = await import('./actions').then(
      (module) => module.showErrors
    )
  }

  return <CodeView {...codeProps} />
}
