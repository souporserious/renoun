import { dirname, extname, join, posix, isAbsolute } from 'node:path'
import type { Project, SourceFile } from './ts-morph.ts'

import { waitForRefreshingProjects } from '../project/refresh.ts'
import {
  isProductionEnvironment,
  isTestEnvironment,
  isVitestRuntime,
} from './env.ts'
import { formatSourceText } from './format-source-text.ts'
import { getLanguage, type Languages } from './get-language.ts'
import { isJsxOnly } from './is-jsx-only.ts'

export interface SourceTextMetadata {
  value: string
  language?: Languages
  filePath?: string
  label?: string
  valueSignature?: string
}

export interface GetSourceTextMetadataOptions extends Omit<
  SourceTextMetadata,
  'label' | 'valueSignature'
> {
  /** The project to use for the source text. */
  project: Project

  /** The base directory to use for the source text. */
  baseDirectory?: string

  /** Whether formatting should be performed. */
  shouldFormat?: boolean

  /** Whether formatting was explicitly requested by the caller. */
  isFormattingExplicit?: boolean

  /** Whether explicit in-memory snippets should use a content-addressed path. */
  virtualizeFilePath?: boolean
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

export function getSourceTextValueSignature(value: string): string {
  return `${hashInlineSourceText(value)}:${value.length}`
}

function toVirtualSourceTextFilePath(
  filePath: string,
  valueSignature: string
): string {
  const sanitizedSignature = valueSignature.replace(/[^A-Za-z0-9_-]/g, '_')
  const extension = extname(filePath)
  const virtualSuffix = `.__renoun_snippet_${sanitizedSignature}`

  if (!extension) {
    return `${filePath}${virtualSuffix}`
  }

  return `${filePath.slice(0, -extension.length)}${virtualSuffix}${extension}`
}

function coerceSourceFileToModule(sourceFile: SourceFile): void {
  // Add an empty export declaration to coerce TypeScript to treat the file as a module.
  // This is needed due to a bug in ts-morph: https://github.com/dsherret/ts-morph/issues/1611
  const hasImports = sourceFile.getImportDeclarations().length > 0
  const hasExports = sourceFile.getExportDeclarations().length > 0

  if (!hasImports && !hasExports) {
    sourceFile.addExportDeclaration({})
  }
}

function isJavaScriptLikeMetadata(options: {
  filePath?: string
  language?: Languages
}): boolean {
  let language = options.language

  if (!language && options.filePath) {
    language = options.filePath.split('.').pop() as Languages | undefined
  }

  if (!language) {
    return false
  }

  return ['js', 'jsx', 'ts', 'tsx'].includes(getLanguage(language))
}

export function hydrateSourceTextMetadataSourceFile(
  project: Project,
  metadata: Pick<SourceTextMetadata, 'value' | 'language' | 'filePath'>
): void {
  const { filePath } = metadata

  if (!filePath || !isJavaScriptLikeMetadata(metadata)) {
    return
  }

  if (project.getSourceFile(filePath)) {
    return
  }

  const sourceFile = project.createSourceFile(filePath, metadata.value, {
    overwrite: true,
  })

  coerceSourceFileToModule(sourceFile)
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
  const valueSignature = getSourceTextValueSignature(resolved.value)
  const filePath =
    options.virtualizeFilePath &&
    resolved.isJavaScriptLikeLanguage &&
    options.filePath
      ? toVirtualSourceTextFilePath(resolved.filePath, valueSignature)
      : resolved.filePath

  return {
    value: resolved.value,
    language: resolved.language,
    filePath,
    label: resolved.label,
    valueSignature,
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
  virtualizeFilePath = false,
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
  const shouldVirtualizeFilePath =
    virtualizeFilePath &&
    Boolean(filePathProp) &&
    isJavaScriptLikeLanguage

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
            !isVitestRuntime() &&
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

  if (shouldVirtualizeFilePath) {
    filePath = toVirtualSourceTextFilePath(
      resolved.filePath,
      getSourceTextValueSignature(finalValue)
    )
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
      coerceSourceFileToModule(sourceFile)
      const analysisValue = sourceFile.getFullText().trim()

      if (shouldVirtualizeFilePath) {
        const virtualFilePath = toVirtualSourceTextFilePath(
          resolved.filePath,
          getSourceTextValueSignature(analysisValue)
        )

        if (virtualFilePath !== filePath) {
          project.createSourceFile(virtualFilePath, analysisValue, {
            overwrite: true,
          })
          project.removeSourceFile(sourceFile)
          filePath = virtualFilePath
        }
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

  const valueSignature = getSourceTextValueSignature(finalValue)

  return {
    value: finalValue,
    language: finalLanguage,
    filePath,
    label: resolved.label,
    valueSignature,
  }
}
