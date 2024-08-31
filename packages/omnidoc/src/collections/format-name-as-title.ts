const lowercaseWords = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'if',
  'in',
  'nor',
  'of',
  'on',
  'or',
  'so',
  'the',
  'to',
  'up',
  'yet',
])

/** Format a camel-cased, dash-cased, or snake-cased name as a title */
export function formatNameAsTitle(name: string) {
  return (
    name
      // Replace dashes and underscores with spaces
      .replace(/[-_]/g, ' ')
      // Insert space between lowercase and uppercase letters e.g. "IconButton" -> "Icon Button"
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      // Handle acronyms e.g. "APIReference" -> "API Reference"
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      // Capitalize the first letter of each word, except for words that should be lowercase unless they're the first or last word
      .replace(/\b\w+\b/g, (word, index, words) => {
        const isFirstOrLastWord = index === 0 || index === words.length - 1
        return isFirstOrLastWord || !lowercaseWords.has(word.toLowerCase())
          ? word.charAt(0).toUpperCase() + word.slice(1)
          : word.toLowerCase()
      })
  )
}
