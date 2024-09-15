/** Create a slug from a string. */
export function createSlug(input: string) {
  return input
    .replace(/([a-z])([A-Z])/g, '$1-$2') // Add a hyphen between lower and upper case letters
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2') // Add a hyphen between consecutive upper case letters followed by a lower case letter
    .replace(/[_\s]+/g, '-') // Replace underscores and spaces with a hyphen
    .toLowerCase() // Convert the entire string to lowercase
}
