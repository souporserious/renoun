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
  'md',
  'mdx',
] as const

export type JavaScriptLikeExtensions = (typeof javascriptLikeExtensions)[number]

export type HasJavaScriptLikeExtensions<FileExtensions extends string[]> =
  Extract<FileExtensions[number], JavaScriptLikeExtensions> extends never
    ? false
    : true

export function isJavaScriptLikeExtension(
  extension: string | undefined
): extension is JavaScriptLikeExtensions {
  return javascriptLikeExtensions
    ? javascriptLikeExtensions.includes(extension as JavaScriptLikeExtensions)
    : false
}
