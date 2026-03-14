import type { Project, ts } from './ts-morph.ts'

import { getRootDirectory } from './get-root-directory.ts'
import { normalizeSlashes } from './path.ts'

export interface QuickInfoAtPosition {
  displayText: string
  documentationText: string
}

interface QuickInfoDisplayTextFormatOptions {
  rootDirectory?: string
  currentWorkingDirectory?: string
}

const QUICK_INFO_IMPORT_PATH_PATTERN = /\bimport\((['"])([^'"]+)\1\)/g

export function getQuickInfoAtPosition(options: {
  project: Project
  filePath: string
  position: number
}): QuickInfoAtPosition | undefined {
  const { project, filePath, position } = options
  if (!filePath || Number.isFinite(position) === false || position < 0) {
    return undefined
  }

  const sourceFile =
    project.getSourceFile(filePath) ?? project.addSourceFileAtPathIfExists(filePath)
  if (!sourceFile) {
    return undefined
  }

  const resolvedFilePath = sourceFile.getFilePath()
  const quickInfo = project
    .getLanguageService()
    .compilerObject.getQuickInfoAtPosition(resolvedFilePath, position)
  if (!quickInfo) {
    return undefined
  }

  const displayText = formatQuickInfoDisplayText(
    (quickInfo.displayParts || []).map((part) => part.text).join('')
  )
  const documentationText = formatQuickInfoDocumentationText(
    quickInfo.documentation || []
  )

  return {
    displayText,
    documentationText,
  }
}

export function formatQuickInfoDisplayText(
  displayText: string,
  options: QuickInfoDisplayTextFormatOptions = {}
): string {
  const currentWorkingDirectoryCandidates = getPathReplacementCandidates(
    options.currentWorkingDirectory ?? process.cwd()
  )
  const rootDirectoryCandidates = getPathReplacementCandidates(
    options.rootDirectory ?? getRootDirectory()
  )

  return displayText.replace(
    QUICK_INFO_IMPORT_PATH_PATTERN,
    (_match, quote: string, importPath: string) => {
      const formattedImportPath = shortenQuickInfoImportPath(
        shortenQuickInfoImportPath(importPath, currentWorkingDirectoryCandidates),
        rootDirectoryCandidates
      )

      return `import(${quote}${formattedImportPath}${quote})`
    }
  )
}

function getPathReplacementCandidates(path: string): string[] {
  if (typeof path !== 'string' || path.length === 0) {
    return []
  }

  const candidates = new Set<string>([path, normalizeSlashes(path)])

  return Array.from(candidates).filter((candidate) => candidate.length > 0)
}

function shortenQuickInfoImportPath(importPath: string, candidates: string[]): string {
  for (const candidate of candidates) {
    if (importPath === candidate) {
      return '.'
    }

    if (
      importPath.startsWith(candidate + '/') ||
      importPath.startsWith(candidate + '\\')
    ) {
      return `.${importPath.slice(candidate.length)}`
    }
  }

  return importPath
}

export function formatQuickInfoDocumentationText(
  documentation: ts.SymbolDisplayPart[]
): string {
  let markdownText = ''
  let currentLinkUrl = ''
  let currentLinkText = ''

  documentation.forEach((part) => {
    if (part.kind === 'linkText' || part.kind === 'linkName') {
      const [url, ...descriptionParts] = part.text.split(' ')
      currentLinkUrl = url
      currentLinkText = descriptionParts.join(' ') || url
      return
    }

    if (part.kind === 'link') {
      if (currentLinkUrl) {
        markdownText += `[${currentLinkText}](${currentLinkUrl})`
        currentLinkText = ''
        currentLinkUrl = ''
      }
      return
    }

    if (currentLinkUrl) {
      markdownText += `[${currentLinkText}](${currentLinkUrl})`
      currentLinkText = ''
      currentLinkUrl = ''
    }

    markdownText += part.text
  })

  if (currentLinkUrl) {
    markdownText += `[${currentLinkText}](${currentLinkUrl})`
  }

  return markdownText
}
