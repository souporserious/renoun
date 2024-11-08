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

export function isJavaScriptLikeExtension(
  extension: string
): extension is JavaScriptLikeExtensions {
  return javascriptLikeExtensions.includes(
    extension as JavaScriptLikeExtensions
  )
}
