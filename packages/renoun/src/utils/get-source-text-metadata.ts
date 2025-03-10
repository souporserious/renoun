import crypto from 'node:crypto'
import { join, posix } from 'node:path'
import type { Project } from 'ts-morph'

import { waitForRefreshingProjects } from '../project/refresh.js'
import { formatSourceText } from './format-source-text.js'
import { getLanguage, type Languages } from './get-language.js'
import { isJsxOnly } from './is-jsx-only.js'

export interface GetSourceTextMetadataOptions {
  project: Project
  value: string
  language?: Languages
  filePath?: string
  shouldFormat?: boolean
}

export interface GetSourceTextMetadataResult {
  value: string
  language: Languages
  filePath: string
  label: string
}

export const generatedFilenames = new Set<string>()

/** Identifier for the scope of generated file names to prevent conflicts. */
const scopeId = '_renoun'

/**
 * Parses and normalizes source text metadata. This also optionally formats the
 * source text using the project's installed formatter. If this is a JavaScript
 * or TypeScript code block, a ts-morph source file is created to type-check the
 * source text.
 */
export async function getSourceTextMetadata({
  project,
  filePath: filePathProp,
  language,
  shouldFormat = true,
  value,
}: GetSourceTextMetadataOptions): Promise<GetSourceTextMetadataResult> {
  await waitForRefreshingProjects()

  let finalValue = value
  let finalLanguage = language
  let isGeneratedFilename = false
  let id = filePathProp

  // generate a unique id for the code block based on the contents if a file path is not provided
  if (filePathProp === undefined) {
    const hex = crypto.createHash('sha256').update(value).digest('hex')
    if (hex) {
      id = hex
    }
  }

  if (!finalLanguage) {
    finalLanguage = (filePathProp?.split('.').pop() as Languages) || 'plaintext'
  }

  if (typeof finalLanguage === 'string') {
    finalLanguage = getLanguage(finalLanguage)
  }

  const isJavaScriptLikeLanguage = ['js', 'jsx', 'ts', 'tsx'].includes(
    finalLanguage
  )
  const jsxOnly = isJavaScriptLikeLanguage ? isJsxOnly(finalValue) : false
  let filePath = filePathProp

  if (!filePath) {
    filePath = `${id}.${finalLanguage}`
    isGeneratedFilename = true
  }

  // Format source text if enabled.
  if (shouldFormat) {
    try {
      finalValue = await formatSourceText(filePath, finalValue, finalLanguage)
    } catch (error) {
      throw new Error(
        `[renoun] Error formatting CodeBlock source text${filePath ? ` at file path "${filePath}"` : ''} ${error}`
      )
    }

    // Trim trailing newline from formatting.
    if (jsxOnly) {
      finalValue = finalValue.trimEnd()
    }

    // Trim semicolon from formatting.
    if (jsxOnly && finalValue.startsWith(';')) {
      finalValue = finalValue.slice(1)
    }
  }

  // Scope code block source files since they can conflict with other files on disk.
  filePath = join(scopeId, filePath)

  // Store generated file names to provide better error messages
  if (isGeneratedFilename) {
    generatedFilenames.add(filePath)
  }

  // Add extension if file path prop is missing it so it can be loaded into TypeScript.
  if (isJavaScriptLikeLanguage && !filePath.includes('.')) {
    if (!finalLanguage) {
      throw new Error(
        `[renoun] The "language" prop was not provided to the CodeBlock component and could not be inferred from the file path. Pass a valid "filePath" with extension or a "language" prop`
      )
    }

    filePath = `${filePath}.${finalLanguage}`
  }

  // Create a ts-morph source file to type-check JavaScript and TypeScript code blocks.
  if (isJavaScriptLikeLanguage) {
    try {
      const sourceFile = project.createSourceFile(filePath, finalValue, {
        overwrite: true,
      })

      finalValue = sourceFile.getFullText().trim()

      // If no imports or exports add an empty export declaration to coerce TypeScript to treat the file as a module
      const hasImports = sourceFile.getImportDeclarations().length > 0
      const hasExports = sourceFile.getExportDeclarations().length > 0

      if (!hasImports && !hasExports) {
        sourceFile.addExportDeclaration({})
      }
    } catch (error) {
      if (error instanceof Error) {
        const workingDirectory = process.cwd()
        throw new Error(
          `[renoun] Error trying to create CodeBlock source file at working directory "${workingDirectory}"`,
          { cause: error }
        )
      }
    }
  }

  const label = (filePathProp || filePath)
    // Remove _renoun/ prefix
    .replace(join(scopeId, posix.sep), '')
    // Remove ordered number prefix
    .replace(/\d+\./, '')

  return {
    value: finalValue,
    language: finalLanguage,
    filePath,
    label,
  }
}
