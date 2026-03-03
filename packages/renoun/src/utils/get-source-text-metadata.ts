import { dirname, join, posix, isAbsolute } from 'node:path'
import type { Project } from './ts-morph.ts'

import { waitForRefreshingProjects } from '../project/refresh.ts'
import { isProductionEnvironment, isTestEnvironment } from './env.ts'
import { formatSourceText } from './format-source-text.ts'
import { getLanguage, type Languages } from './get-language.ts'
import { isJsxOnly } from './is-jsx-only.ts'

export interface SourceTextMetadata {
  value: string
  language?: Languages
  filePath?: string
  label?: string
}

export interface GetSourceTextMetadataOptions extends Omit<
  SourceTextMetadata,
  'label'
> {
  /** The project to use for the source text. */
  project: Project

  /** The base directory to use for the source text. */
  baseDirectory?: string

  /** Whether formatting should be performed. */
  shouldFormat?: boolean

  /** Whether formatting was explicitly requested by the caller. */
  isFormattingExplicit?: boolean
}

export const generatedFilenames = new Set<string>()

/** Identifier for the scope of generated file names to prevent conflicts. */
const scopeId = '_renoun'

function hashInlineSourceText(value: string): string {
  let hash = 0x811c9dc5

  for (let index = 0, length = value.length; index < length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16)
}

function resolveSourceTextMetadataBase(options: {
  value: string
  filePath?: string
  language?: Languages
  baseDirectory?: string
  project: Project
}): {
  value: string
  language: Languages
  filePath: string
  label: string | undefined
  isJavaScriptLikeLanguage: boolean
  isGeneratedFileName: boolean
  jsxOnly: boolean
} {
  const {
    value,
    filePath: filePathProp,
    language: languageProp,
    baseDirectory,
    project,
  } = options
  let finalLanguage = languageProp
  let isGeneratedFileName = false
  let id = filePathProp

  if (filePathProp === undefined) {
    id = hashInlineSourceText(value)
  }

  if (finalLanguage === undefined) {
    if (filePathProp) {
      const extension = filePathProp.split('.').pop() as Languages
      finalLanguage = extension
    } else {
      finalLanguage = 'txt'
    }
  }

  if (typeof finalLanguage === 'string') {
    finalLanguage = getLanguage(finalLanguage)
  }

  const isJavaScriptLikeLanguage = ['js', 'jsx', 'ts', 'tsx'].includes(
    finalLanguage
  )
  const jsxOnly = isJavaScriptLikeLanguage ? isJsxOnly(value) : false
  let filePath = filePathProp

  if (!filePath) {
    filePath = `${id}.${finalLanguage}`
    isGeneratedFileName = true
  }

  if (baseDirectory) {
    if (isAbsolute(baseDirectory)) {
      filePath = join(baseDirectory, filePath)
    } else {
      const { configFilePath } = project.getCompilerOptions()
      const tsconfigDirectory = dirname(String(configFilePath))
      filePath = join(tsconfigDirectory, baseDirectory, filePath)
    }
  }

  if (baseDirectory === undefined) {
    filePath = join(scopeId, filePath)
  }

  if (isGeneratedFileName) {
    generatedFilenames.add(filePath)
  }

  if (isJavaScriptLikeLanguage && !filePath.includes('.')) {
    filePath = `${filePath}.${finalLanguage}`
  }

  const label = isGeneratedFileName
    ? undefined
    : (filePathProp || filePath)
        .replace(join(scopeId, posix.sep), '')
        .replace(/\d+\./, '')

  return {
    value,
    language: finalLanguage,
    filePath,
    label,
    isJavaScriptLikeLanguage,
    isGeneratedFileName,
    jsxOnly,
  }
}

export function getSourceTextMetadataFallback(options: Omit<
  GetSourceTextMetadataOptions,
  'shouldFormat' | 'isFormattingExplicit'
>): SourceTextMetadata {
  const resolved = resolveSourceTextMetadataBase(options)

  return {
    value: resolved.value,
    language: resolved.language,
    filePath: resolved.filePath,
    label: resolved.label,
  }
}

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
  isFormattingExplicit,
  value,
  baseDirectory,
}: GetSourceTextMetadataOptions): Promise<SourceTextMetadata> {
  const resolved = resolveSourceTextMetadataBase({
    value,
    filePath: filePathProp,
    language,
    baseDirectory,
    project,
  })
  let finalValue = resolved.value
  const finalLanguage = resolved.language
  const isJavaScriptLikeLanguage = resolved.isJavaScriptLikeLanguage
  const jsxOnly = resolved.jsxOnly

  if (isJavaScriptLikeLanguage) {
    await waitForRefreshingProjects()
  }

  let filePath = resolved.filePath

  // Format source text if enabled.
  if (shouldFormat) {
    try {
      finalValue = await formatSourceText(
        filePath,
        finalValue,
        finalLanguage,
        isFormattingExplicit,
        {
          nonBlocking:
            !isProductionEnvironment() &&
            !isTestEnvironment() &&
            isFormattingExplicit !== true,
        }
      )
    } catch (error) {
      throw new Error(
        `[renoun] Error formatting CodeBlock source text using language "${finalLanguage}"${filePath ? ` at file path "${filePath}"` : ''} ${error}`
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

  // Create a ts-morph source file to type-check JavaScript and TypeScript code blocks.
  if (isJavaScriptLikeLanguage) {
    try {
      const sourceFile = project.createSourceFile(filePath, finalValue, {
        overwrite: true,
      })

      // Attempt to fix imports for JSX-only files
      if (jsxOnly) {
        sourceFile.fixMissingImports()

        // Remove `type` keyword from import declarations this is added by `fixMissingImports`
        // which prefers type-only imports causing an error since this is JSX
        for (const importDeclaration of sourceFile.getImportDeclarations()) {
          if (importDeclaration.isTypeOnly()) {
            importDeclaration.setIsTypeOnly(false)
          }
        }
      }

      finalValue = sourceFile.getFullText().trim()

      // Add an empty export declaration to coerce TypeScript to treat the file as a module
      // This is needed due to a bug in ts-morph: https://github.com/dsherret/ts-morph/issues/1611
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

  return {
    value: finalValue,
    language: finalLanguage,
    filePath,
    label: resolved.label,
  }
}
