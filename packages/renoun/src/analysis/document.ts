import { extname, isAbsolute, join, posix } from 'node:path'

import type { Project, SourceFile } from '../utils/ts-morph.ts'
import { getLanguage, type Languages } from '../utils/get-language.ts'
import { isJsxOnly } from '../utils/is-jsx-only.ts'

const GENERATED_DOCUMENT_SCOPE = '_renoun'
const RESERVED_ANALYSIS_DOCUMENT_STABLE_ALIAS = '__renoun_source'
const VIRTUAL_ANALYSIS_DOCUMENT_FILE_PATH_PATTERN =
  /\.__renoun_snippet_[A-Za-z0-9_-]+(?=(\.[^./\\]+)?$)/
const resolvedVirtualizedStableFilePathsByProject = new WeakMap<
  Project,
  Map<string, string>
>()

interface AnalysisDocumentBase {
  value: string
  language: Languages
  filePath: string
  label: string | undefined
  valueSignature: string
  isJavaScriptLikeLanguage: boolean
  isGeneratedFileName: boolean
  jsxOnly: boolean
  shouldVirtualizeFilePath: boolean
}

export type AnalysisDocument =
  | (AnalysisDocumentBase & {
      kind: 'file'
    })
  | (AnalysisDocumentBase & {
      kind: 'snippet'
      basePath?: string
      contentHash: string
    })

export type ResolvedAnalysisDocument = AnalysisDocument

export interface ResolveAnalysisDocumentOptions {
  value: string
  filePath?: string
  language?: Languages
  baseDirectory?: string
  tsConfigDirectory?: string
  project?: Project
  virtualizeFilePath?: boolean
}

export const generatedFilenames = new Set<string>()

function hashInlineSourceText(value: string): string {
  let hash = 0x811c9dc5

  for (let index = 0, length = value.length; index < length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16)
}

export function getSourceTextValueSignature(value: string): string {
  return `${hashInlineSourceText(value)}:${value.length}`
}

function toVirtualAnalysisDocumentFilePath(
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

function toProtectedAnalysisDocumentStableFilePath(filePath: string): string {
  if (filePath.includes(`.${RESERVED_ANALYSIS_DOCUMENT_STABLE_ALIAS}`)) {
    return filePath
  }

  const extension = extname(filePath)
  const protectedSuffix = `.${RESERVED_ANALYSIS_DOCUMENT_STABLE_ALIAS}`

  if (!extension) {
    return `${filePath}${protectedSuffix}`
  }

  return `${filePath.slice(0, -extension.length)}${protectedSuffix}${extension}`
}

export function coerceAnalysisDocumentSourceFileToModule(
  sourceFile: SourceFile
): void {
  const hasImports = sourceFile.getImportDeclarations().length > 0
  const hasExports =
    sourceFile.getExportDeclarations().length > 0 ||
    sourceFile.getExportAssignments().length > 0 ||
    sourceFile.getStatements().some((statement) => {
      const exportableStatement = statement as {
        hasExportKeyword?: () => boolean
      }

      return exportableStatement.hasExportKeyword?.() === true
    })

  if (!hasImports && !hasExports) {
    sourceFile.addExportDeclaration({})
  }
}

function isJavaScriptLikeAnalysisDocument(options: {
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

function isGeneratedAnalysisDocumentFilePath(filePath: string): boolean {
  return (
    filePath === GENERATED_DOCUMENT_SCOPE ||
    filePath.startsWith(`${GENERATED_DOCUMENT_SCOPE}/`) ||
    filePath.includes(`/${GENERATED_DOCUMENT_SCOPE}/`)
  )
}

function getResolvedVirtualizedStableFilePaths(
  project: Project
): Map<string, string> {
  let resolvedPaths = resolvedVirtualizedStableFilePathsByProject.get(project)

  if (!resolvedPaths) {
    resolvedPaths = new Map()
    resolvedVirtualizedStableFilePathsByProject.set(project, resolvedPaths)
  }

  return resolvedPaths
}

function hasProgramSourceFile(project: Project, filePath: string): boolean {
  if (project.getSourceFile(filePath)) {
    return true
  }

  if (isAbsolute(filePath)) {
    return false
  }

  return project
    .getSourceFiles()
    .some((sourceFile) => sourceFile.getFilePath().endsWith(`/${filePath}`))
}

export function resolveVirtualizedAnalysisDocumentStableFilePath(
  project: Project | undefined,
  filePath: string
): string {
  if (
    project === undefined ||
    isGeneratedAnalysisDocumentFilePath(filePath) ||
    filePath.includes(`.${RESERVED_ANALYSIS_DOCUMENT_STABLE_ALIAS}`)
  ) {
    return filePath
  }

  const resolvedPaths = getResolvedVirtualizedStableFilePaths(project)
  const cachedResolvedPath = resolvedPaths.get(filePath)

  if (cachedResolvedPath !== undefined) {
    const compilerOptions = project.getCompilerOptions() as {
      configFilePath?: string
    }

    if (
      cachedResolvedPath === filePath &&
      isAbsolute(filePath) &&
      typeof compilerOptions.configFilePath === 'string' &&
      compilerOptions.configFilePath.length > 0 &&
      project.getFileSystem().fileExistsSync(filePath)
    ) {
      const protectedPath = toProtectedAnalysisDocumentStableFilePath(filePath)
      resolvedPaths.set(filePath, protectedPath)
      return protectedPath
    }

    return cachedResolvedPath
  }

  const resolvedPath =
    project.getSourceFile(filePath) !== undefined ||
    project.getFileSystem().fileExistsSync(filePath)
      ? toProtectedAnalysisDocumentStableFilePath(filePath)
      : filePath

  resolvedPaths.set(filePath, resolvedPath)

  return resolvedPath
}

export function hydrateAnalysisDocumentSourceFile(
  project: Project,
  metadata: {
    value: string
    language?: Languages
    filePath?: string
  }
): void {
  const { filePath } = metadata

  if (!filePath || !isJavaScriptLikeAnalysisDocument(metadata)) {
    return
  }

  const stableSnippetFilePath =
    getAnalysisDocumentStableFilePathFromVirtualFilePath(filePath)

  if (
    stableSnippetFilePath &&
    !hasProgramSourceFile(project, stableSnippetFilePath)
  ) {
    const stableSourceFile = project.createSourceFile(
      stableSnippetFilePath,
      metadata.value,
      {
        overwrite: true,
      }
    )

    coerceAnalysisDocumentSourceFileToModule(stableSourceFile)
  }

  if (hasProgramSourceFile(project, filePath)) {
    return
  }

  const sourceFile = project.createSourceFile(filePath, metadata.value, {
    overwrite: true,
  })
  coerceAnalysisDocumentSourceFileToModule(sourceFile)
}

export function getAnalysisDocumentStableFilePath(
  document: ResolvedAnalysisDocument
): string {
  return document.kind === 'snippet'
    ? document.basePath ?? document.filePath
    : document.filePath
}

export function getAnalysisDocumentStableFilePathFromVirtualFilePath(
  filePath: string
): string | undefined {
  const stableFilePath = filePath.replace(
    VIRTUAL_ANALYSIS_DOCUMENT_FILE_PATH_PATTERN,
    ''
  )

  return stableFilePath === filePath ? undefined : stableFilePath
}

export function getOriginalAnalysisDocumentFilePathFromStableFilePath(
  filePath: string
): string {
  if (!filePath.includes(`.${RESERVED_ANALYSIS_DOCUMENT_STABLE_ALIAS}`)) {
    return filePath
  }

  const extension = extname(filePath)
  const protectedSuffix = `.${RESERVED_ANALYSIS_DOCUMENT_STABLE_ALIAS}`

  if (!extension) {
    return filePath.slice(0, -protectedSuffix.length)
  }

  const basePath = filePath.slice(0, -extension.length)
  return `${basePath.slice(0, -protectedSuffix.length)}${extension}`
}

export function resolveAnalysisDocument({
  value,
  filePath: filePathProp,
  language: languageProp,
  baseDirectory,
  tsConfigDirectory,
  project,
  virtualizeFilePath = false,
}: ResolveAnalysisDocumentOptions): ResolvedAnalysisDocument {
  let language = languageProp
  let isGeneratedFileName = false
  let id = filePathProp

  if (filePathProp === undefined) {
    id = hashInlineSourceText(value)
  }

  if (language === undefined) {
    if (filePathProp) {
      language = filePathProp.split('.').pop() as Languages
    } else {
      language = 'txt'
    }
  }

  language = getLanguage(language)

  const isJavaScriptLikeLanguage = ['js', 'jsx', 'ts', 'tsx'].includes(
    language
  )
  const jsxOnly = isJavaScriptLikeLanguage ? isJsxOnly(value) : false
  let filePath = filePathProp

  if (!filePath) {
    filePath = `${id}.${language}`
    isGeneratedFileName = true
  }

  if (baseDirectory) {
    if (isAbsolute(baseDirectory)) {
      filePath = join(baseDirectory, filePath)
    } else if (tsConfigDirectory) {
      filePath = join(tsConfigDirectory, baseDirectory, filePath)
    } else {
      filePath = join(baseDirectory, filePath)
    }
  }

  if (
    baseDirectory === undefined &&
    !isAbsolute(filePath) &&
    !isGeneratedAnalysisDocumentFilePath(filePath)
  ) {
    filePath = join(GENERATED_DOCUMENT_SCOPE, filePath)
  }

  if (isGeneratedFileName) {
    generatedFilenames.add(filePath)
  }

  if (isJavaScriptLikeLanguage && !filePath.includes('.')) {
    filePath = `${filePath}.${language}`
  }

  const label = isGeneratedFileName
    ? undefined
    : (filePathProp || filePath)
        .replace(join(GENERATED_DOCUMENT_SCOPE, posix.sep), '')
        .replace(/\d+\./, '')
  const valueSignature = getSourceTextValueSignature(value)
  const shouldVirtualizeFilePath =
    virtualizeFilePath &&
    Boolean(filePathProp) &&
    isJavaScriptLikeLanguage
  const stableFilePath = shouldVirtualizeFilePath
    ? resolveVirtualizedAnalysisDocumentStableFilePath(project, filePath)
    : filePath

  if (shouldVirtualizeFilePath) {
    return {
      kind: 'snippet',
      value,
      language,
      filePath: toVirtualAnalysisDocumentFilePath(
        stableFilePath,
        valueSignature
      ),
      basePath: stableFilePath,
      contentHash: hashInlineSourceText(value),
      label,
      valueSignature,
      isJavaScriptLikeLanguage,
      isGeneratedFileName,
      jsxOnly,
      shouldVirtualizeFilePath,
    }
  }

  if (filePathProp === undefined || isGeneratedFileName) {
    return {
      kind: 'snippet',
      value,
      language,
      filePath,
      contentHash: hashInlineSourceText(value),
      label,
      valueSignature,
      isJavaScriptLikeLanguage,
      isGeneratedFileName,
      jsxOnly,
      shouldVirtualizeFilePath,
    }
  }

  return {
    kind: 'file',
    value,
    language,
    filePath,
    label,
    valueSignature,
    isJavaScriptLikeLanguage,
    isGeneratedFileName,
    jsxOnly,
    shouldVirtualizeFilePath,
  }
}

export function updateAnalysisDocumentValue(
  document: ResolvedAnalysisDocument,
  value: string
): ResolvedAnalysisDocument {
  const valueSignature = getSourceTextValueSignature(value)

  if (document.kind === 'snippet') {
    const stableFilePath = getAnalysisDocumentStableFilePath(document)

    return {
      ...document,
      value,
      valueSignature,
      contentHash: hashInlineSourceText(value),
      filePath: document.shouldVirtualizeFilePath
        ? toVirtualAnalysisDocumentFilePath(stableFilePath, valueSignature)
        : document.filePath,
      ...(stableFilePath !== document.filePath ? { basePath: stableFilePath } : {}),
    }
  }

  return {
    ...document,
    value,
    valueSignature,
  }
}

export function toSourceTextMetadata(
  document: Pick<
    ResolvedAnalysisDocument,
    'value' | 'language' | 'filePath' | 'label' | 'valueSignature'
  >
) {
  return {
    value: document.value,
    language: document.language,
    filePath: document.filePath,
    label: document.label,
    valueSignature: document.valueSignature,
  }
}
