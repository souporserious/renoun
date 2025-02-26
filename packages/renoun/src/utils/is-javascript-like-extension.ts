export const javascriptLikeExtensions = [
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

export type JavaScriptLikeExtensions = (typeof javascriptLikeExtensions)[number]

export type HasJavaScriptLikeExtensions<FileExtensions extends string[]> =
  Extract<FileExtensions[number], JavaScriptLikeExtensions> extends never
    ? false
    : true

export type IsJavaScriptLikeExtension<FileExtension extends string> =
  FileExtension extends JavaScriptLikeExtensions ? true : false

export function isJavaScriptLikeExtension(
  extension: string | undefined
): extension is JavaScriptLikeExtensions {
  return javascriptLikeExtensions
    ? javascriptLikeExtensions.includes(extension as JavaScriptLikeExtensions)
    : false
}
