import crypto from 'node:crypto'
import { join, posix, isAbsolute } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { Project, SourceFile } from 'ts-morph'

import { formatSourceText } from './format-source-text.js'
import { getLanguage, type Languages } from './get-language.js'
import { isJsxOnly } from './is-jsx-only.js'
import type { ExclusiveUnion } from '../types.js'

type BaseParseMetadataOptions = {
  project: Project
  filename?: string
  language?: Languages
  allowErrors?: boolean | string
  shouldFormat?: boolean
  isInline?: boolean
}

export type ParseMetadataOptions = BaseParseMetadataOptions &
  ExclusiveUnion<
    | { value: string }
    | {
        source: string
        workingDirectory?: string
      }
  >

export type ParseMetadataResult = {
  filename: string
  filenameLabel: string
  value: string
  language: Languages
}

export const generatedFilenames = new Set<string>()

/** Identifier for the scope of generated filenames to prevent conflicts. */
const scopeId = '_renoun'

/** Parses and normalizes source text metadata. */
export async function parseSourceTextMetadata({
  project,
  filename: filenameProp,
  language,
  allowErrors = false,
  shouldFormat = true,
  isInline = false,
  ...props
}: ParseMetadataOptions): Promise<ParseMetadataResult> {
  const componentName = isInline ? 'CodeInline' : 'CodeBlock'
  let finalValue: string = ''
  let finalLanguage = language
  let isGeneratedFilename = false
  let id = 'source' in props ? props.source : filenameProp

  if ('value' in props) {
    if (props.value) {
      finalValue = props.value

      // generate a unique id for the code block based on the contents if a filename is not provided
      if (id === undefined) {
        const hex = crypto
          .createHash('sha256')
          .update(props.value)
          .digest('hex')
        if (hex) {
          id = hex
        }
      }
    }
  } else if ('source' in props) {
    const isRelative = !isAbsolute(props.source)
    const workingDirectory = props.workingDirectory

    if (isRelative && !workingDirectory) {
      throw new Error(
        `[renoun] The "workingDirectory" prop is required for "${componentName}" with the relative source "${props.source}".\n\nPass a valid [workingDirectory]. If this is being renderend directly in an MDX file, make sure the "renoun/remark" plugin is configured correctly.`
      )
    }

    const sourcePropPath = isRelative
      ? join(workingDirectory!, props.source)
      : props.source

    finalValue = await readFile(sourcePropPath, 'utf-8')

    if (!language) {
      finalLanguage = sourcePropPath.split('.').pop()! as Languages
    }
  }

  if (!finalLanguage) {
    finalLanguage = (filenameProp?.split('.').pop() as Languages) || 'plaintext'
  }

  if (typeof finalLanguage === 'string') {
    finalLanguage = getLanguage(finalLanguage)
  }

  const isJavaScriptLikeLanguage = ['js', 'jsx', 'ts', 'tsx'].includes(
    finalLanguage
  )
  const jsxOnly = isJavaScriptLikeLanguage ? isJsxOnly(finalValue) : false
  let filename = 'source' in props ? props.source : filenameProp
  let sourceFile: SourceFile | undefined

  if (!filename) {
    filename = `${id}.${finalLanguage}`
    isGeneratedFilename = true
  }

  // Format source text if enabled.
  if (shouldFormat) {
    try {
      finalValue = await formatSourceText(filename, finalValue, finalLanguage)
    } catch (error) {
      throw new Error(
        `[renoun] Error formatting "${componentName}" source text${filename ? ` at filename "${filename}"` : ''} ${error}`
      )
    }

    // Trim trailing newline from formatting.
    if (jsxOnly) {
      finalValue = finalValue.trimEnd()
    }

    // Trim semicolon from formatting.
    if ((jsxOnly || isInline) && finalValue.startsWith(';')) {
      finalValue = finalValue.slice(1)
    }
  }

  // Scope code block source files since they can conflict with other files on disk.
  if ('value' in props) {
    filename = join(scopeId, filename)
  }

  // Store generated filenames to provide better error messages
  if (isGeneratedFilename) {
    generatedFilenames.add(filename)
  }

  // Add extension if filename prop is missing it so it can be loaded into TypeScript.
  if (isJavaScriptLikeLanguage && !filename.includes('.')) {
    if (!finalLanguage) {
      throw new Error(
        `[renoun] The "language" prop was not provided to the "${componentName}" component and could not be inferred from the filename. Pass a valid "filename" with extension or a "language" prop`
      )
    }

    filename = `${filename}.${finalLanguage}`
  }

  // Trim extra whitespace from inline code blocks since it's difficult to read.
  if (isInline) {
    finalValue = finalValue.replace(/\s+/g, ' ')
  }

  // Create a ts-morph source file to type-check JavaScript and TypeScript code blocks.
  if (isJavaScriptLikeLanguage) {
    try {
      sourceFile = project.createSourceFile(filename, finalValue, {
        overwrite: true,
      })

      if (!isInline) {
        // If no imports or exports add an empty export declaration to coerce TypeScript to treat the file as a module
        const hasImports = sourceFile.getImportDeclarations().length > 0
        const hasExports = sourceFile.getExportDeclarations().length > 0

        if (!hasImports && !hasExports) {
          sourceFile.addExportDeclaration({})
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        const workingDirectory = process.cwd()
        throw new Error(
          `[renoun] Error trying to create "${componentName}" source file at working directory "${workingDirectory}"`,
          { cause: error }
        )
      }
    }
  }

  const filenameLabel = (filenameProp || filename)
    .replace(join(scopeId, posix.sep), '') // Remove _renoun/ prefix
    .replace(/\d+\./, '') // Remove ordered number prefix

  return {
    filename,
    filenameLabel,
    value: sourceFile ? sourceFile.getFullText() : finalValue,
    language: finalLanguage,
  }
}
