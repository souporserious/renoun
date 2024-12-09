export type SlugCasings = 'none' | 'kebab' | 'snake'

/** Create a slug from a string. */
export function createSlug(
  input: string,
  format: 'none' | 'kebab' | 'snake' = 'none'
) {
  if (format === 'none') return input

  const separator = format === 'snake' ? '_' : '-'

  return input
    .replace(/([a-z])([A-Z])/g, `$1${separator}$2`) // Add the separator between lower and upper case letters
    .replace(/([A-Z])([A-Z][a-z])/g, `$1${separator}$2`) // Add the separator between consecutive upper case letters followed by a lower case letter
    .replace(/[_\s]+/g, separator) // Replace underscores and spaces with the separator
    .toLowerCase() // Convert the entire string to lowercase
}
