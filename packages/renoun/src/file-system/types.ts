export type Expect<Type extends true> = Type

export type Not<_ extends false> = true

export type Is<Type, Expected> = Type extends Expected ? true : false

export type IsNot<Type, Expected> = Type extends Expected ? false : true

export type IsAny<Type> = 0 extends 1 & Type ? true : false

export type IsNotAny<Type> = true extends IsAny<Type> ? false : true

export type IsNever<Type> = Type extends never ? true : false

export type DirectoryEntry = {
  name: string
  path: string
  isDirectory: boolean
  isFile: boolean
}

/** Get the last segment of a path. */
type LastSegment<Path extends string> = Path extends `${infer _}/${infer Rest}`
  ? LastSegment<Rest>
  : Path

/**
 * Tests if a string leads with a number followed by a single dot.
 *
 * - `"01.introduction"` => `true` (numeric prefix + single dot)
 * - `"02.configuration.mdx"` => `false` (numeric prefix + 2 dots)
 * - `"myfile.txt"` => `false` (not purely a numeric prefix)
 */
type IsSingleDotNumericPrefix<Segment extends string> =
  Segment extends `${infer Digits}.${infer Rest}`
    ? Digits extends `${number}`
      ? // If `Rest` itself has another dot, then it's multiple dots => `false`
        Rest extends `${string}.${string}`
        ? false
        : true
      : false
    : false

/** Get the last part of a string after the final dot. */
type LastPartAfterDot<Segment extends string> =
  Segment extends `${string}.${infer Tail}` ? LastPartAfterDot<Tail> : Segment

/** Split a string by a delimiter. */
type SplitBy<
  Pattern extends string,
  Delimiter extends string,
> = Pattern extends `${infer Head}${Delimiter}${infer Tail}`
  ? Head | SplitBy<Tail, Delimiter>
  : Pattern

/** Parse the extension from a string. */
type ParseExtension<Extension extends string> =
  Extension extends `{${infer Nested}}`
    ? SplitBy<LastPartAfterDot<Nested>, ','>
    : Extension extends `@(${infer Nested})`
      ? SplitBy<LastPartAfterDot<Nested>, '|'>
      : LastPartAfterDot<Extension>

/** Extract the file extension from a path. */
export type ExtractFileExtension<Path extends string> =
  IsSingleDotNumericPrefix<LastSegment<Path>> extends true
    ? string
    : LastSegment<Path> extends `${string}.${infer Extension}`
      ? ParseExtension<Extension>
      : LastSegment<Path> extends `**/*.${infer Ext}`
        ? ParseExtension<Ext>
        : LastSegment<Path> extends `${string}/**/*.${infer Ext}`
          ? ParseExtension<Ext>
          : LastSegment<Path> extends `*.${infer Ext}`
            ? ParseExtension<Ext>
            : string

export type IsRecursiveFilePattern<Pattern extends string> =
  Pattern extends `**/${string}`
    ? true
    : Pattern extends `${string}/**/${string}`
      ? true
      : Pattern extends `${string}/**`
        ? true
        : false

type Tests = [
  Expect<Is<ExtractFileExtension<'index.ts'>, 'ts'>>,
  Expect<Is<ExtractFileExtension<'**/*.ts'>, 'ts'>>,
  Expect<Is<ExtractFileExtension<'*.tsx'>, 'tsx'>>,
  Expect<Is<ExtractFileExtension<'src/**/*.js'>, 'js'>>,
  Expect<Is<ExtractFileExtension<'src/**/index.ts'>, 'ts'>>,
  Expect<Is<ExtractFileExtension<'src/index.ts'>, 'ts'>>,
  Expect<Is<ExtractFileExtension<'src/index'>, string>>,
  Expect<Is<ExtractFileExtension<'/components/Button.test.tsx'>, 'tsx'>>,
  Expect<Is<ExtractFileExtension<'01.introduction'>, string>>,
  Expect<Is<ExtractFileExtension<'docs/01.introduction'>, string>>,
  Expect<Is<ExtractFileExtension<'docs/02.configuration.mdx'>, 'mdx'>>,
  Expect<Is<ExtractFileExtension<'src/index.{ts,tsx}'>, 'ts' | 'tsx'>>,
]
