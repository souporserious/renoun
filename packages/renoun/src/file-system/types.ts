export type DirectoryEntry = {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
}

type SplitBy<
  Pattern extends string,
  Delimiter extends string,
> = Pattern extends `${infer Head}${Delimiter}${infer Tail}`
  ? Head | SplitBy<Tail, Delimiter>
  : Pattern

type ParseExtension<Extension extends string> =
  Extension extends `{${infer NestedExtension}}`
    ? SplitBy<NestedExtension, ','>
    : Extension extends `@(${infer NestedExtension})`
      ? SplitBy<NestedExtension, '|'>
      : Extension

export type ExtractFilePatternExtension<Pattern extends string> =
  Pattern extends `${string}/**/*.${infer Extension}`
    ? ParseExtension<Extension>
    : Pattern extends `**/*.${infer Extension}`
      ? ParseExtension<Extension>
      : Pattern extends `*.${infer Extension}`
        ? ParseExtension<Extension>
        : Pattern extends `${string}.${infer Extension}`
          ? ParseExtension<Extension>
          : never

export type IsRecursiveFilePattern<Pattern extends string> =
  Pattern extends `**/${string}`
    ? true
    : Pattern extends `${string}/**/${string}`
      ? true
      : Pattern extends `${string}/**`
        ? true
        : false
