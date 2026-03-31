import { dirname } from 'node:path'

import type { Project } from '../../utils/ts-morph.ts'

import { waitForRefreshingPrograms } from '../refresh.ts'
import {
  coerceAnalysisDocumentSourceFileToModule,
  generatedFilenames,
  getAnalysisDocumentStableFilePath,
  getSourceTextValueSignature,
  resolveAnalysisDocument,
  sourceFileTextMatchesAnalysisDocumentValue,
  toSourceTextMetadata,
  trimSyntheticAnalysisDocumentModuleExport,
  updateAnalysisDocumentValue,
  hydrateAnalysisDocumentSourceFile,
} from '../document.ts'
import { getAnalysisDocumentStableFilePathFromVirtualFilePath } from '../document-paths.ts'
import { formatSourceText } from '../../utils/format-source-text.ts'
import type { Languages } from '../../utils/get-language.ts'
import {
  removeProgramSourceFileIfPresent,
  syncVirtualSnippetSourceFiles,
  touchVirtualSnippetRegistration,
} from './snippet-registry.ts'

export interface SourceTextMetadata {
  value: string
  language?: Languages
  filePath?: string
  label?: string
  valueSignature?: string
}

export type SourceTextHydrationMetadata = Pick<
  SourceTextMetadata,
  'value' | 'language'
>

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

export {
  generatedFilenames,
  getSourceTextValueSignature,
}

export function hydrateSourceTextMetadataSourceFile(
  project: Project,
  metadata: SourceTextMetadata
): void {
  const { filePath } = metadata

  if (!filePath) {
    return
  }

  const stableSnippetFilePath =
    getAnalysisDocumentStableFilePathFromVirtualFilePath(filePath)

  if (!stableSnippetFilePath) {
    hydrateAnalysisDocumentSourceFile(project, metadata)
    return
  }

  const hydratedDocument = resolveAnalysisDocument({
    project,
    value: metadata.value,
    filePath: stableSnippetFilePath,
    language: metadata.language,
    virtualizeFilePath: true,
  })

  if (hydratedDocument.kind !== 'snippet') {
    hydrateAnalysisDocumentSourceFile(project, metadata)
    return
  }

  const stableFilePath = getAnalysisDocumentStableFilePath(hydratedDocument)
  const virtualSourceFile = project.getSourceFile(filePath)
  const stableSourceFile = project.getSourceFile(stableFilePath)

  if (
    virtualSourceFile &&
    stableSourceFile &&
    sourceFileTextMatchesAnalysisDocumentValue(
      virtualSourceFile.getFullText(),
      metadata.value
    ) &&
    sourceFileTextMatchesAnalysisDocumentValue(
      stableSourceFile.getFullText(),
      metadata.value
    )
  ) {
    touchVirtualSnippetRegistration(project, {
      ...hydratedDocument,
      filePath,
      valueSignature: metadata.valueSignature ?? hydratedDocument.valueSignature,
    })
    return
  }

  const sourceFile = project.createSourceFile(filePath, metadata.value, {
    overwrite: true,
  })
  coerceAnalysisDocumentSourceFileToModule(sourceFile)

  syncVirtualSnippetSourceFiles(project, {
    ...hydratedDocument,
    filePath,
    valueSignature: metadata.valueSignature ?? hydratedDocument.valueSignature,
  })
}

function getProgramTsConfigDirectory(project: Project): string | undefined {
  const configFilePath = project.getCompilerOptions()['configFilePath']

  if (typeof configFilePath !== 'string' || configFilePath.length === 0) {
    return undefined
  }

  return dirname(configFilePath)
}

export function getSourceTextMetadataFallback(options: Omit<
  GetSourceTextMetadataOptions,
  'shouldFormat' | 'isFormattingExplicit'
>): SourceTextMetadata {
  const { project, ...documentOptions } = options

  return toSourceTextMetadata(
    resolveAnalysisDocument({
      project,
      ...documentOptions,
      tsConfigDirectory: getProgramTsConfigDirectory(project),
    })
  )
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
  let document = resolveAnalysisDocument({
    project,
    value,
    filePath: filePathProp,
    language,
    baseDirectory,
    tsConfigDirectory: getProgramTsConfigDirectory(project),
    virtualizeFilePath,
  })
  const finalLanguage = document.language
  const isJavaScriptLikeLanguage = document.isJavaScriptLikeLanguage
  const jsxOnly = document.jsxOnly
  let finalValue = document.value

  if (isJavaScriptLikeLanguage) {
    await waitForRefreshingPrograms()
  }

  // Format source text if enabled.
  if (shouldFormat) {
    try {
      finalValue = await formatSourceText(
        document.filePath,
        document.value,
        finalLanguage,
        isFormattingExplicit
      )
    } catch (error) {
      throw new Error(
        `[renoun] Error formatting CodeBlock source text using language "${finalLanguage}"${document.filePath ? ` at file path "${document.filePath}"` : ''} ${error}`
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
    document = updateAnalysisDocumentValue(document, finalValue)
  }

  // Create a ts-morph source file to type-check JavaScript and TypeScript code blocks.
  if (isJavaScriptLikeLanguage) {
    try {
      let sourceFile = project.createSourceFile(
        document.filePath,
        document.value,
        {
          overwrite: true,
        }
      )

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

      const addedSyntheticModuleExport =
        coerceAnalysisDocumentSourceFileToModule(sourceFile)
      const normalizedSourceText = sourceFile.getFullText().trim()

      const normalizedDocument = updateAnalysisDocumentValue(
        document,
        addedSyntheticModuleExport
          ? trimSyntheticAnalysisDocumentModuleExport(normalizedSourceText)
          : normalizedSourceText
      )

      if (project.getSourceFile(normalizedDocument.filePath) !== sourceFile) {
        removeProgramSourceFileIfPresent(project, sourceFile.getFilePath())

        sourceFile = project.createSourceFile(
          normalizedDocument.filePath,
          normalizedDocument.value,
          {
            overwrite: true,
          }
        )

        coerceAnalysisDocumentSourceFileToModule(sourceFile)
      }

      document = normalizedDocument
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

  syncVirtualSnippetSourceFiles(project, document)

  return toSourceTextMetadata(document)
}
