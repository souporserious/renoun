/**
 * Determines if the code only contains JSX by removing all imports
 * and checking if the remaining code starts and ends with a JSX tag.
 */
export function isJsxOnly(code: string) {
  const jsxContent = code
    .replace(/^import.*;$/gm, '') // Remove all imports
    .replace(';', '') // Remove any trailing semicolons
    .trim()
  return jsxContent.startsWith('<') && jsxContent.endsWith('>')
}
