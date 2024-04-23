import crypto from 'node:crypto'
import { join, sep, isAbsolute } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { SourceFile } from 'ts-morph'
import { format, resolveConfig } from 'prettier'
import 'server-only'

import { isJsxOnly } from '../../utils/is-jsx-only'
import { project } from '../project'

const languageMap = {
  mjs: 'javascript',
  js: 'javascript',
  ts: 'typescript',
}

type BaseParseMetadataOptions = {
  filename?: string
  language: string
}

export type ParseMetadataOptions = BaseParseMetadataOptions &
  (
    | { value: string }
    | {
        source: string
        workingDirectory?: string
      }
  )

/** Parses and normalizes source text metadata. */
export async function parseSourceTextMetadata({
  filename: filenameProp,
  language,
  ...props
}: ParseMetadataOptions) {
  let finalValue: string = ''
  let finalLanguage =
    typeof language === 'string' && language in languageMap
      ? languageMap[language as keyof typeof languageMap]
      : language
  let id = 'source' in props ? props.source : filenameProp

  if ('value' in props) {
    finalValue = props.value

    if (id === undefined) {
      const hex = crypto.createHash('sha256').update(props.value).digest('hex')
      if (hex) {
        id = hex
      }
    }
  } else if ('source' in props) {
    const isRelative = !isAbsolute(props.source)
    const workingDirectory = props.workingDirectory

    if (isRelative && !workingDirectory) {
      throw new Error(
        'The [workingDirectory] prop was not provided to the [CodeBlock] component while using a relative path. Pass a valid [workingDirectory] or make sure the mdxts/remark plugin and mdxts/loader are configured correctly if this is being renderend in an MDX file.'
      )
    }

    const sourcePropPath = isRelative
      ? join(workingDirectory!, props.source)
      : props.source

    finalValue = await readFile(sourcePropPath, 'utf-8')

    if (!language) {
      finalLanguage = sourcePropPath.split('.').pop()!
    }
  }

  if (!finalLanguage) {
    finalLanguage = filenameProp?.split('.').pop() || 'plaintext'
  }

  const isJavaScriptLikeLanguage = ['js', 'jsx', 'ts', 'tsx'].includes(
    finalLanguage
  )
  const jsxOnly = isJavaScriptLikeLanguage ? isJsxOnly(finalValue) : false
  let filename = 'source' in props ? props.source : filenameProp
  let sourceFile: SourceFile | undefined

  if (!filename) {
    filename = `${id}.${finalLanguage}`
  }

  // Format JavaScript code blocks.
  if (isJavaScriptLikeLanguage) {
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

  // Create a ts-morph source file to type-check JavaScript and TypeScript code blocks.
  if (isJavaScriptLikeLanguage) {
    try {
      sourceFile = project
        .createSourceFile(filename, finalValue, {
          overwrite: true,
        })
        .fixMissingImports()
    } catch (error) {
      if (error instanceof Error) {
        const workingDirectory = process.cwd()
        throw new Error(
          `[mdxts] Error trying to create CodeBlock source file at working directory "${workingDirectory}"`,
          { cause: error }
        )
      }
    }
  }

  const filenameLabel = filename
    .replace(join('mdxts', sep), '') // Remove mdxts/ prefix
    .replace(/\d+\./, '') // Remove ordered number prefix

  return {
    value: finalValue,
    language: finalLanguage,
    isJsxOnly: jsxOnly,
    sourceFile,
    filename,
    filenameLabel,
  }
}
