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
  const documentationText = formatDocumentationText(quickInfo.documentation || [])

  return {
    displayText,
    documentationText,
  }
}

export function formatQuickInfoDisplayText(
  displayText: string,
  options: QuickInfoDisplayTextFormatOptions = {}
): string {
  let formattedDisplayText = displayText

  for (const candidate of getPathReplacementCandidates(
    options.currentWorkingDirectory ?? process.cwd()
  )) {
    formattedDisplayText = formattedDisplayText.replaceAll(candidate, '.')
  }

  for (const candidate of getPathReplacementCandidates(
    options.rootDirectory ?? getRootDirectory()
  )) {
    formattedDisplayText = formattedDisplayText.replaceAll(candidate, '.')
  }

  return formattedDisplayText
}

function getPathReplacementCandidates(path: string): string[] {
  if (typeof path !== 'string' || path.length === 0) {
    return []
  }

  const candidates = new Set<string>([path, normalizeSlashes(path)])

  return Array.from(candidates).filter((candidate) => candidate.length > 0)
}

function formatDocumentationText(documentation: ts.SymbolDisplayPart[]): string {
  let markdownText = ''
  let currentLinkUrl = ''
  let currentLinkText = ''

  documentation.forEach((part) => {
    if (part.kind !== 'linkName' && currentLinkUrl) {
      markdownText += `[${currentLinkText}](${currentLinkUrl})`
      currentLinkText = ''
      currentLinkUrl = ''
    }

    if (part.kind === 'linkName') {
      const [url, ...descriptionParts] = part.text.split(' ')
      currentLinkUrl = url
      currentLinkText = descriptionParts.join(' ') || url
    } else if (part.kind === 'link') {
      if (currentLinkUrl) {
        markdownText += `[${currentLinkText}](${currentLinkUrl})`
        currentLinkText = ''
        currentLinkUrl = ''
      }
    } else {
      markdownText += part.text
    }
  })

  if (currentLinkUrl) {
    markdownText += `[${currentLinkText}](${currentLinkUrl})`
  }

  return markdownText
}
