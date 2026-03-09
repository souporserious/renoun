import { getLanguage } from '../utils/get-language.ts'

const CODE_FENCE_INDENT_MAX = 3
const CODE_FENCE_MIN_LENGTH = 3
const CODE_FENCE_LANGUAGE_MAX_LENGTH = 64
const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx'])

function countLeadingFenceCharacters(line: string, fenceCharacter: string): number {
  let count = 0
  while (line[count] === fenceCharacter) {
    count += 1
  }
  return count
}

function normalizeFenceLanguageToken(token: string): string | undefined {
  if (typeof token !== 'string' || token.length === 0) {
    return undefined
  }

  let normalized = token.trim()
  if (normalized.length === 0) {
    return undefined
  }

  const braceStartIndex = normalized.indexOf('{')
  if (braceStartIndex > 0) {
    normalized = normalized.slice(0, braceStartIndex)
  }

  normalized = normalized
    .replace(/^[{(]+/, '')
    .replace(/[})]+$/, '')
    .replace(/^\./, '')
    .replace(/^language-/, '')
    .replace(/[,:;]+$/, '')
    .trim()
    .toLowerCase()

  if (
    normalized.length === 0 ||
    normalized.length > CODE_FENCE_LANGUAGE_MAX_LENGTH
  ) {
    return undefined
  }

  const mapped = getLanguage(normalized as any)
  return typeof mapped === 'string' ? mapped.toLowerCase() : normalized
}

export function isMarkdownCodeFenceSourcePath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0) {
    return false
  }

  const lowerPath = path.toLowerCase()
  for (const extension of MARKDOWN_EXTENSIONS) {
    if (lowerPath.endsWith(extension)) {
      return true
    }
  }

  return false
}

export function extractCodeFenceLanguagesFromMarkdown(sourceText: string): string[] {
  if (typeof sourceText !== 'string' || sourceText.length === 0) {
    return []
  }

  const languages = new Set<string>()
  const lines = sourceText.split(/\r?\n/)
  let activeFenceCharacter: '`' | '~' | null = null
  let activeFenceLength = 0

  for (const line of lines) {
    const lineWithoutIndent = line.replace(
      new RegExp(`^ {0,${CODE_FENCE_INDENT_MAX}}`),
      ''
    )

    if (activeFenceCharacter === null) {
      const firstCharacter = lineWithoutIndent[0]
      if (firstCharacter !== '`' && firstCharacter !== '~') {
        continue
      }

      const fenceLength = countLeadingFenceCharacters(
        lineWithoutIndent,
        firstCharacter
      )
      if (fenceLength < CODE_FENCE_MIN_LENGTH) {
        continue
      }

      const infoString = lineWithoutIndent.slice(fenceLength).trim()
      if (infoString.length > 0) {
        const languageToken = infoString.split(/\s+/, 1)[0]!
        const normalizedLanguage = normalizeFenceLanguageToken(languageToken)
        if (normalizedLanguage) {
          languages.add(normalizedLanguage)
        }
      }

      activeFenceCharacter = firstCharacter
      activeFenceLength = fenceLength
      continue
    }

    const firstCharacter = lineWithoutIndent[0]
    if (firstCharacter !== activeFenceCharacter) {
      continue
    }

    const fenceLength = countLeadingFenceCharacters(
      lineWithoutIndent,
      activeFenceCharacter
    )
    if (
      fenceLength >= activeFenceLength &&
      lineWithoutIndent.slice(fenceLength).trim().length === 0
    ) {
      activeFenceCharacter = null
      activeFenceLength = 0
    }
  }

  return Array.from(languages.values())
}
