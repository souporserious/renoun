import { getLanguage } from '../utils/get-language.ts'

const CODE_FENCE_INDENT_MAX = 3
const CODE_FENCE_MIN_LENGTH = 3
const CODE_FENCE_LANGUAGE_MAX_LENGTH = 64
const MARKDOWN_EXTENSIONS = new Set(['.md', '.mdx'])

export interface MarkdownCodeFenceSnippet {
  allowErrors?: boolean | string
  language?: string
  path?: string
  showErrors?: boolean
  shouldFormat: boolean
  value: string
}

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

function parseCodeFenceMetaValue(
  property: string
): string | boolean | number | undefined {
  const equalsIndex = property.indexOf('=')

  if (equalsIndex === -1) {
    return true
  }

  const raw = property.slice(equalsIndex + 1)

  if (/^(['"])(.*)\1$/.test(raw)) {
    return raw.slice(1, -1)
  }

  const match = raw.match(/^\{(.+)\}$/)
  if (!match) {
    return undefined
  }

  const value = match[1]!

  if (/^(['"])(.*)\1$/.test(value)) {
    return value.slice(1, -1)
  }

  if (value === 'true' || value === 'false') {
    return value === 'true'
  }

  const number = Number(value)
  return Number.isNaN(number) ? value : number
}

function parseCodeFenceInfoString(infoString: string): Omit<
  MarkdownCodeFenceSnippet,
  'value'
> {
  const parts = infoString.trim().split(/\s+/).filter(Boolean)
  const rawLanguageToken = parts.shift()
  let language: string | undefined
  let path: string | undefined
  let shouldFormat = false
  let allowErrors: boolean | string | undefined
  let showErrors: boolean | undefined

  if (rawLanguageToken) {
    const normalizedLanguage = normalizeFenceLanguageToken(rawLanguageToken)

    if (normalizedLanguage) {
      const normalizedRawLanguageToken = rawLanguageToken
        .replace(/^language-/, '')
        .trim()
      const dotIndex = normalizedRawLanguageToken.lastIndexOf('.')

      if (
        dotIndex !== -1 &&
        !normalizedRawLanguageToken.startsWith('{') &&
        !normalizedRawLanguageToken.startsWith('(')
      ) {
        path = normalizedRawLanguageToken
        language =
          normalizeFenceLanguageToken(
            normalizedRawLanguageToken.slice(dotIndex + 1)
          ) ?? normalizedLanguage
      } else {
        language = normalizedLanguage
      }
    }
  }

  for (const part of parts) {
    const equalsIndex = part.indexOf('=')
    const key = equalsIndex === -1 ? part : part.slice(0, equalsIndex)
    const parsedValue = parseCodeFenceMetaValue(part)

    if (key === 'path' && typeof parsedValue === 'string') {
      path = parsedValue
      if (!language) {
        const extensionIndex = parsedValue.lastIndexOf('.')
        if (extensionIndex !== -1) {
          language =
            normalizeFenceLanguageToken(parsedValue.slice(extensionIndex + 1)) ??
            language
        }
      }
      continue
    }

    if (key === 'shouldFormat' && typeof parsedValue === 'boolean') {
      shouldFormat = parsedValue
      continue
    }

    if (
      key === 'allowErrors' &&
      (typeof parsedValue === 'boolean' || typeof parsedValue === 'string')
    ) {
      allowErrors = parsedValue
      continue
    }

    if (key === 'showErrors' && typeof parsedValue === 'boolean') {
      showErrors = parsedValue
    }
  }

  return {
    ...(allowErrors !== undefined ? { allowErrors } : {}),
    ...(language ? { language } : {}),
    ...(path ? { path } : {}),
    ...(showErrors !== undefined ? { showErrors } : {}),
    shouldFormat,
  }
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
  return extractCodeFenceSnippetsFromMarkdown(sourceText)
    .map((snippet) => snippet.language)
    .filter((language): language is string => typeof language === 'string')
    .filter((language, index, languages) => languages.indexOf(language) === index)
}

export function extractCodeFenceSnippetsFromMarkdown(
  sourceText: string
): MarkdownCodeFenceSnippet[] {
  if (typeof sourceText !== 'string' || sourceText.length === 0) {
    return []
  }

  const snippets: MarkdownCodeFenceSnippet[] = []
  const lines = sourceText.split(/\r?\n/)
  let activeFenceCharacter: '`' | '~' | null = null
  let activeFenceLength = 0
  let activeSnippet:
    | (Omit<MarkdownCodeFenceSnippet, 'value'> & {
        lines: string[]
      })
    | undefined

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
      activeSnippet = {
        ...parseCodeFenceInfoString(infoString),
        lines: [],
      }
      activeFenceCharacter = firstCharacter
      activeFenceLength = fenceLength
      continue
    }

    const firstCharacter = lineWithoutIndent[0]
    if (firstCharacter !== activeFenceCharacter) {
      activeSnippet?.lines.push(line)
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
      if (activeSnippet) {
        const { lines, ...snippet } = activeSnippet
        snippets.push({
          ...snippet,
          value: lines.join('\n'),
        })
      }
      activeFenceCharacter = null
      activeFenceLength = 0
      activeSnippet = undefined
      continue
    }

    activeSnippet?.lines.push(line)
  }

  return snippets
}
