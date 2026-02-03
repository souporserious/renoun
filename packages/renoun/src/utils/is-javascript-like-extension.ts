const javascriptLikeExtensions = [
  'js',
  'jsx',
  'ts',
  'tsx',
  'mjs',
  'mjsx',
  'cjs',
  'cjsx',
  'mts',
  'mtsx',
  'cts',
  'ctsx',
] as const

export type JavaScriptLikeExtension = (typeof javascriptLikeExtensions)[number]

export type HasJavaScriptLikeExtensions<FileExtensions extends string[]> =
  Extract<FileExtensions[number], JavaScriptLikeExtension> extends never
    ? false
    : true

const javascriptLikeExtensionsRegEx = new RegExp(
  `\\.(${javascriptLikeExtensions.join('|')})$`,
  'i'
)

/** Check if a path has a JavaScript-like file extension. */
export function hasJavaScriptLikeExtension(path: string): boolean {
  return javascriptLikeExtensionsRegEx.test(path)
}

export type IsJavaScriptLikeExtension<FileExtension extends string> =
  FileExtension extends JavaScriptLikeExtension ? true : false

/** Check if a string is a JavaScript-like file extension. */
export function isJavaScriptLikeExtension(
  extension: string | undefined
): extension is JavaScriptLikeExtension {
  return javascriptLikeExtensions
    ? javascriptLikeExtensions.includes(extension as JavaScriptLikeExtension)
    : false
}
