import type { Project, ts } from './ts-morph.ts'

import { getRootDirectory } from './get-root-directory.ts'

export interface QuickInfoAtPosition {
  displayText: string
  documentationText: string
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

  const rootDirectory = getRootDirectory()
  const baseDirectory = process.cwd().replace(rootDirectory, '')
  const displayParts = quickInfo.displayParts || []
  const displayText = displayParts
    .map((part) => part.text)
    .join('')
    .replaceAll(rootDirectory, '.')
    .replaceAll(baseDirectory, '')
    .replaceAll('/renoun', '')
  const documentationText = formatDocumentationText(quickInfo.documentation || [])

  return {
    displayText,
    documentationText,
  }
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
