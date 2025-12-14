import { grammars } from '../grammars/index.ts'

/** Builds a mapping from file extensions to valid language identifiers. */
function buildExtensionToLanguagesMap() {
  const extensionMap: Record<string, string[]> = {}

  // Derive mappings from the grammars data
  for (const languages of Object.values(grammars)) {
    for (const language of languages) {
      // If a language identifier looks like a file extension (short, no spaces/special chars)
      if (
        language.length <= 20 &&
        !language.includes(' ') &&
        !language.includes('/') &&
        !language.includes('-') &&
        !language.includes('#')
      ) {
        // This language identifier can be used as both an extension and a language
        // So for files with this extension, all languages in this grammar entry are valid
        if (!extensionMap[language]) {
          extensionMap[language] = []
        }
        // Add all languages from this grammar entry as valid for this extension
        for (const validLanguage of languages) {
          if (!extensionMap[language].includes(validLanguage)) {
            extensionMap[language].push(validLanguage)
          }
        }
      }
    }
  }

  return extensionMap
}

const extensionToLanguagesMap = buildExtensionToLanguagesMap()

/** Validates that the provided language is compatible with the file extension. */
export function validateLanguageFileCompatibility(
  language: string,
  filePath: string
) {
  const fileExtension = filePath.split('.').pop()?.toLowerCase()

  if (!fileExtension) {
    return // No extension to validate against
  }

  const validLanguages = extensionToLanguagesMap[fileExtension] || []

  // Allow plaintext-like languages for any file
  const plaintextLanguages = ['plaintext', 'text', 'txt', 'diff']
  if (plaintextLanguages.includes(language)) {
    return
  }

  // If we have known valid languages for this extension, check compatibility
  if (validLanguages.length > 0 && !validLanguages.includes(language)) {
    const suggestedLanguage = validLanguages[0]

    throw new Error(
      `[renoun] getTokens received language "${language}" for file "${filePath}". ` +
        `Expected one of: ${validLanguages.join(', ')}. ` +
        `Pass "language: '${suggestedLanguage}'" (or omit language to auto-detect) to avoid syntax highlighting issues.`
    )
  }
}

const jsTsLanguages = ['javascript', 'js', 'jsx', 'typescript', 'ts', 'tsx']
const jsTsExtensions = ['mjs', 'cjs', 'mts', 'cts']

/** Checks if a file extension corresponds to a JavaScript/TypeScript file. */
export function isJavaScriptTypeScriptFile(filePath: string): boolean {
  const fileExtension = filePath.split('.').pop()?.toLowerCase()

  if (!fileExtension) {
    return false
  }

  const validLanguages = extensionToLanguagesMap[fileExtension] || []

  return (
    validLanguages.some((language) => jsTsLanguages.includes(language)) ||
    jsTsExtensions.includes(fileExtension)
  )
}
