import type { Languages } from './get-tokens'

const languageKey = 'language-'
const languageLength = languageKey.length

/** Parses file metadata from a remark code block class name. */
export function getClassNameMetadata(className: string | string[]) {
  const classNames = Array.isArray(className) ? className : className.split(' ')
  const filenameOrLanguage = classNames
    .find((name) => name.startsWith(languageKey))
    ?.slice(languageLength)

  if (!filenameOrLanguage) {
    return null
  }

  const extension = filenameOrLanguage.split('.').pop() ?? filenameOrLanguage

  return {
    filename: filenameOrLanguage?.includes('.') ? filenameOrLanguage : null,
    language: extension,
  } as {
    filename: string | null
    language: Languages
  }
}
