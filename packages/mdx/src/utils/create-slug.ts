export type SlugCasing = 'none' | 'kebab' | 'snake'

/** Create a slug from a string. */
export function createSlug(input: string, format: SlugCasing = 'kebab') {
  if (format === 'none') return input

  const baseSlug = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // strip zero-width characters
    .replace(/([a-z\d])([A-Z])/g, '$1-$2') // split camelCase
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2') // split consecutive capitals followed by lowercase
    .replace(/[\p{Pd}\s_]+/gu, '-') // spaces/any dash → -
    .replace(/[^\p{Letter}\p{Number}-]+/gu, '') // drop other punctuation/symbols
    .replace(/-+/g, '-') // collapse ---
    .replace(/^-+|-+$/g, '') // trim -
    .toLowerCase()
    // Ensure "JavaScript" and "TypeScript" stay intact
    .replace(/java-script/g, 'javascript')
    .replace(/type-script/g, 'typescript')

  if (format === 'snake') {
    return baseSlug.replace(/-/g, '_')
  }

  return baseSlug
}
