# renoun

## 8.13.0

### Minor Changes

- 6bf096d: Updates exported `headings` variable from the `addHeadings` remark plugin to include a new `children` property to allow rendering the JSX children of the heading element.

  For example, headings with inline code or links:

  ```mdx
  # Heading with `code`
  ```

  Roughly yields:

  ```mdx
  export const headings = [
    {
      level: 1,
      id: 'heading-with-code',
      text: 'Heading with code',
      children: (
        <>
          Heading with <code>code</code>
        </>
      ),
    },
  ]

  # Heading with `code`
  ```

  ### Breaking Changes

  The `depth` property of the heading metadata object was renamed to `level` to better reflect HTML nomenclature.

- 899fb08: Adds back `getDefaultExport` and `getNamedExport` for both `JavaScriptFile` and `MDXFile` classes. These methods are useful as type guards to narrow types when building utilities that work with both JavaScript and MDX files.
- f96a2be: Adds a first-class `Refresh` component for refreshing the server during development when a source file changes:

  ```tsx
  import { Refresh } from 'renoun/components'

  export default function RootLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    return (
      <html lang="en">
        <body>
          {children}
          <Refresh />
        </body>
      </html>
    )
  }
  ```

  This was previously automated for `JavaScriptFile` / `MDXFile` component exports. However, it did not provide a robust enough solution for all use cases. This new component ensures that only one listener will ever be added.

- af2a21a: Includes `MDXContent` type by default now when using `MDXFile`. Previously, `{ default: MDXContent }` had to be defined explicitly. Now, it is merged in automatically with optional export types:

  ```tsx
  import { MDXFile } from 'renoun/file-system'

  const file = new MDXFile<{
    frontmatter: { title: string; date: Date }
  }>({
    path: 'path/to/file.mdx',
  })
  ```

### Patch Changes

- 36d62b6: Removes default `hr` margin in `QuickInfo` markdown container.
- Updated dependencies [6bf096d]
  - @renoun/mdx@2.1.0

## 8.12.0

### Minor Changes

- a862ea2: Updates all dependencies to latest version.

### Patch Changes

- Updated dependencies [d7d15f7]
- Updated dependencies [b33e5ca]
- Updated dependencies [6d6684f]
  - @renoun/mdx@2.0.0

## 8.11.0

### Minor Changes

- a0c78fd: Exports the `ThemeStyles` component for more granular control of managing multiple themes.
- 50f816b: Adds back the `workingDirectory` prop to the `CodeBlock` component for targeting local files. When defined, this will be joined with the `path` prop to load a source file located within the file system instead of creating a virtual file which allows imports and types to be resolved correctly.
- 7107876: Fixes `parsePreProps` types to include `children`.
- a4c6205: Optimizes the `JavaScriptFile#getText({ includeDependencies: true })` method to be more performant.
- a7e75c3: Cleans up default styles for `Tokens` quick info popover.

### Patch Changes

- 0b0e28f: Fixes cached package dependency check causing missing formatting on initial load during development.
- bce883d: Fix theme CSS variable collisions by prefixing theme variable names.
- a0e39d8: Improves default colors for `QuickInfo` across themes.
- 04421e0: Removes duplicate code text for functions and components in `APIReference`.
- 23604c6: Fixes the `CodeBlock` component server context not restoring the previous value which causes the `Toolbar` component to receive the incorrect value.

## 8.10.0

### Minor Changes

- 41d7551: Renames `CodeBlock` `filename` prop to `path` to better reflect its purpose since a nested file path can be defined.

  ### Breaking Changes

  The `filename` prop in the `CodeBlock` component has been renamed to `path`. Update any references to the `filename` prop in components or MDX pages that use the `CodeBlock` component for rendering code fences.

- 78e5234: Adds a `shouldAnalyze` prop to `CodeBlock`, `CodeInline`, and `Tokens` components for controlling whether or not to analyze and type-check source code.
- 5c966d1: Uses the `Tokens` component within `CodeInline` when a `language` is provided.
- e3e2dea: Removes `source` and `workingDirectory` props from `CodeBlock` component since these can be calculated using `readFile` explicitly.

  ### Breaking Changes

  The `source` and `workingDirectory` props from `CodeBlock` component have been removed. Use `readFile` to read the source file contents:

  ```tsx
  import { CodeBlock } from 'renoun/components'
  import { readFile } from 'node:fs/promises'

  export function CodeBlock() {
    return (
      <CodeBlock language="tsx">
        {readFile('src/components/Button.tsx', 'utf-8')}
      </CodeBlock>
    )
  }
  ```

### Patch Changes

- 8d232ac: Fixes `LineNumbers` not awaiting the text value from `Tokens`.
- 417155e: Fixes duplicate key warning in development for `Tokens` component.
- bdbc887: Fixes `CodeInline` fallback state causing layout shift.
- 120e0eb: Fixes `CodeBlock` erroring for `text` and `txt` languages.

## 8.9.0

### Minor Changes

- 49f6179: Adds `copyButton` property to `CodeBlock` `css`, `className`, and `style` props for overriding `CopyButton` styles.
- 90417e5: Improves composition for `CodeBlock` by allowing `Tokens` to accept string children to be tokenized and highlighted:

  ```tsx
  import { Tokens } from 'renoun/components'

  export function App() {
    return <Tokens>const foo = 'bar';</Tokens>
  }
  ```

  This removes the need to pass a `value` prop to `CodeBlock`.

  ### Breaking Changes

  The `CodeBlock` `value` prop should now be passed as a child to the `Tokens` component:

  ```diff
  -<CodeBlock language="ts" value="const foo = 'bar';" />
  +<CodeBlock language="ts">const foo = 'bar';</CodeBlock>
  ```

- 72567ea: Renames the `MDXRenderer` `value` prop to `children` to be consistent with other components.

  ### Breaking Changes

  The `MDXRenderer` `value` prop has been renamed to `children`:

  ```diff
  -<MDXRenderer value="# Hello World" />
  +<MDXRenderer># Hello World</MDXRenderer>
  ```

- 24a31df: Allows passing a string to `allowCopy` for both `CodeBlock` and `CodeInline` components:

  ```tsx
  <CodeInline allowCopy="npx create-renoun@latest" language="bash">
    npx create-renoun
  </CodeInline>
  ```

- 89ce87f: Optimizes calculating whether or not to apply the base color for a token by moving the calculation to the `Tokenizer` class.
- e67e284: Moves inline code `language` parsing to `parseCodeProps` utility.
- ff7f63d: Renames the `CodeInline` `value` prop to `children` to better integrate with Markdown and MDX renderers.

  ### Breaking Changes

  The `CodeInline` `value` prop has been renamed to `children`:

  ```diff
  -<CodeInline language="js" value="const foo = 'bar';" />
  +<CodeInline language="js">const foo = 'bar';</CodeInline>
  ```

### Patch Changes

- 7d9b83a: Fixes parsing language from Markdown and MDX when using filenames:

  ````mdx
  ```use-hover.ts
  export function useHover() {
    // ...
  }
  ```
  ````

- Updated dependencies [3dac737]
- Updated dependencies [e67e284]
  - @renoun/mdx@1.6.0

## 8.8.0

### Minor Changes

- 3ef7096: Removes initial symbol highlighting styles that were triggered when the pointer entered the `CodeBlock` component. These styles are too opinionated and should be left for the user to define.
- 22eec86: Improves the fallback theme colors used throughout components to better match the theme author's intent.
- 836a6b3: Adds a new `useThemePicker` hook for selecting a theme from the configured themes:

  ```tsx
  'use client'
  import { useThemePicker } from 'renoun/components'

  export function ThemePicker() {
    const [theme, setTheme] = useThemePicker()

    return (
      <select value={theme} onChange={(event) => setTheme(event.target.value)}>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    )
  }
  ```

  The theme can be toggled or set explicitly using the `setTheme` function. Note, that `theme` is always initially set to `undefined` since it cannot be known until the React tree is hydrated. Use the `data-theme` attribute to style the app based on the selected theme.

- bed53d7: Replaces [shiki](https://github.com/shikijs/shiki) with an internal `createTokenizer` utility that uses [oniguruma-to-es](https://github.com/slevithan/oniguruma-to-es) and [vscode-textmate](https://github.com/shikijs/vscode-textmate) directly. This implementation is based on both [textmate-highlighter](https://github.com/fabiospampinato/textmate-highlighter) and `shiki` to provide a smaller, focused highlighter that allows for more granular control.

### Patch Changes

- da9b603: Fixes a regression from when multiple themes were introduced that had removed token rendering optimizations. Now tokens across themes that are not a symbol and match the foreground color will not be wrapped in an element.
- bed53d7: Fixes an issue when highlighting multiple themes where tokens were only generated correctly for the first theme.
- 970102c: Fixes `QuickInfo` popover not staying contained within the viewport for smaller screens.
- 2100b91: Fixes `CopyButton` icon size filling the entire container.
- Updated dependencies [a5c470c]
  - @renoun/mdx@1.5.0

## 8.7.0

### Minor Changes

- e6ad215: Adds `MDXFile`, `MDXFileExport`, and `isMDXFile` classes and utilities to better differentiate between specific MDX and JavaScript file methods. This also helps with performance since we should never attempt to analyze an MDX file using the TypeScript compiler and allows for future MDX-specific methods to be added.

  ### Breaking Changes

  In some cases there may be breaking changes if you were loading mdx files and targeting `JavaScriptFile` related classes or types. These should be transitioned to the new `MDXFile`, `MDXFileExport`, and `isMDXFile` respectively.

- 073b6d1: Adds a cache for `Directory#getEntries` and `JavaScriptFile#getFileExports` during production builds to help with performance since these methods can be called multiple times during a build.

### Patch Changes

- 29e19e5: Fixes default MDX file system loader not including all exports.
- f1d6b47: Improves `exclude` filtering performance by caching the minimatch pattern.
- 5c4e0ec: Fixes default MDX loader to parse inline code props.
- Updated dependencies [b325412]
  - @renoun/mdx@1.4.1

## 8.6.0

### Minor Changes

- edbee62: Adds [Pierre](https://pierre.co/) as a git provider option that can be configured in the `renoun.json` file:

  ```json
  {
    "git": {
      "source": "https://pierre.co/souporserious/renoun"
    }
  }
  ```

### Patch Changes

- 7b13d1e: Throws better error message when missing git configuration.

## 8.5.0

### Minor Changes

- 720e101: Adds the ability to override specific theme values. You can now provide a tuple when configuring themes that specifies the specific theme values to override:

  ```json
  {
    "theme": {
      "light": "vitesse-light",
      "dark": [
        "vitesse-dark",
        {
          "colors": {
            "editor.background": "#000000",
            "panel.border": "#666666"
          }
        }
      ]
    }
  }
  ```

  This accepts a subset of a VS Code theme to override, specifically the `colors`, `tokenColors`, and `semanticTokenColors` properties.

### Patch Changes

- abaa0f9: Fixes font styles when using multiple themes.
- 6abb6ad: Fixes error when tokens are different among multiple themes.
- 0e884db: Fixes `QuickInfo` syntax highlighting when using multiple themes.
- 9e97dc7: Fixes forced theme on `CodeBlock`.
- f056a45: Uses correct CSS style selector for theme token variables.
- 17b33f0: Fixes loading local theme when using multiple themes.
- 31f7f4e: Updates `CodeInline` background color to be consistent with `CodeBlock`.

## 8.4.0

### Minor Changes

- 4079759: Allows `CodeBlock` `value` prop to accept a promise that will resolve within the Suspense boundary.
- 5f524f5: Updates all dependencies to their latest version.
- fba9490: Adds support for defining multiple syntax highlighting themes in `renoun.json`:

  ```json
  {
    "theme": {
      "light": "vitesse-light",
      "dark": "vitesse-dark"
    }
  }
  ```

  This requires using a new `ThemeProvider` component that will inject the proper CSS Variables in the head of the document:

  ```tsx
  import { ThemeProvider } from 'renoun/components'

  export default function RootLayout({
    children,
  }: {
    children: React.ReactNode
  }) {
    return (
      <html lang="en">
        <body>
          <ThemeProvider />
          {children}
        </body>
      </html>
    )
  }
  ```

  To use a specific theme, append a `data-theme` attribute to the `html` element or another parent element:

  ```html
  <html data-theme="dark" lang="en">
    ...
  </html>
  ```

- 26757a9: Adds `includeDependencies` option to `JavaScriptFileExport#getText` method. When enabled, this will include all dependencies of the export declaration in the returned text.
- c831cb6: Updates a project's default compiler options to only be set when using `MemoryFileSystem`. This makes sure to respect the local `tsconfig.json` file without any implicit overrides when using `NodeFileSystem`.

### Patch Changes

- 33b0adb: Exports `DefaultModuleTypes` to ensure all types used in public API declarations are explicitly available.
- b55efb0: Fixes `File#getSlug` appending an extension.
- 0a2f85c: Fixes Next.js warning for wrong `NODE_ENV` set to production during development.
- Updated dependencies [5f524f5]
  - @renoun/mdx@1.4.0

## 8.3.2

### Patch Changes

- 076403c: Update `restyle` dependency to latest version.

## 8.3.1

### Patch Changes

- ae38994: Update `shiki` dependency to latest version.
- Updated dependencies [ae38994]
  - @renoun/mdx@1.3.2

## 8.3.0

### Minor Changes

- b7895d2: Renames file system `pathCasing` option to `slugCasing` to better reflect its purpose. This also adds an option for configuring the casing used for `JavaScriptFileExport`.
- 03d7591: Exports a `parseCodeProps` utility for the `CodeInline` component to makie it easier to parse and type custom MDX components correctly:

  ```tsx
  import { CodeInline, parseCodeProps } from 'renoun/components'
  import type { MDXComponents } from 'renoun/mdx'

  export function useMDXComponents() {
    return {
      code: (props) => {
        return <CodeInline {...parseCodeProps(props)} />
      },
    } satisfies MDXComponents
  }
  ```

- 3547b64: Exports the `parsePreProps` utility for the `CodeBlock` component instead of attaching it to the component itself:

  ```tsx
  import { CodeBlock, parsePreProps } from 'renoun/components'
  import type { MDXComponents } from 'renoun/mdx'

  export function useMDXComponents() {
    return {
      pre: (props) => {
        return <CodeBlock {...parsePreProps(props)} />
      },
    } satisfies MDXComponents
  }
  ```

### Patch Changes

- 1555cca: Fixes return type in `APIReference` always spanning entire width.

## 8.2.0

### Minor Changes

- 2af679d: Adds `createFile` method to `MemoryFileSystem`.
- dec8620: Removes predefined `MDXComponents` components since it's easy to instantiate yourself which allows overriding defaults. The same functionality can be achieved by defining the components directly:

  ```tsx
  import { CodeBlock, CodeInline } from 'renoun/components'
  import type { MDXComponents } from 'renoun/mdx'

  const mdxComponents = {
    pre: (props) => {
      const { value, language } = CodeBlock.parsePreProps(props)
      return <CodeBlock value={value} language={language} />
    },
    code: (props) => {
      return <CodeInline value={props.children} language="typescript" />
    },
  } satisfies MDXComponents
  ```

- 2b4aa82: Renames `File#getModifier` to `File#getModifierName` to be more descriptive and avoid confusion.

### Patch Changes

- f05656d: Fixes missing JS Doc metadata for overloads in `JavaScriptFileExport#getType`.
- f47bd21: Fixes type aliases being inferred as components in `JavaScriptFileExport#getType`.
- 38a8ae1: Exports `DirectoryOptions` interface.
- 72b8e58: Fixes `APIReference` documentation for overloads.

## 8.1.0

### Minor Changes

- 339ef75: Aligns `CodeBlock` scroll container styles with `CodeInline`.

### Patch Changes

- 5390d03: Fixes [Standard Schema](https://github.com/standard-schema/standard-schema) types not working by copying them directly into the project.
- 94f53da: Fixes `CodeBlock` fallback layout shift during development.
- 5a641b3: Fixes collapsed right padding for `CodeInline` when container is scrolled to the end.
- ca25cd3: Fixes missing bottom padding for `CodeInline` in iOS Safari.

## 8.0.0

### Major Changes

- 02facb1: Removes `renoun/collections` package export and all related types and utilities that were deprecated in [v7.8.0](https://github.com/souporserious/renoun/releases/tag/renoun%407.8.0).

  ### Breaking Changes

  The `renoun/collections` package was removed. To upgrade, move to the `renoun/file-system` package and use the `Directory` class instead. In most cases, you can replace `Collection` with `Directory` and `CompositeCollection` with `EntryGroup`.

  #### Before

  ```tsx
  import { Collection, CompositeCollection } from 'renoun/collections'

  const docs = new Collection({
    filePattern: '*.mdx',
    baseDirectory: 'docs',
  })
  const components = new Collection({
    filePattern: '*.{ts,tsx}',
    baseDirectory: 'src/components',
  })
  const compositeCollection = new CompositeCollection(docs, components)
  ```

  #### After

  ```tsx
  import { Directory, EntryGroup } from 'renoun/file-system'

  const docs = new Directory({
    path: 'docs',
    include: '*.mdx',
  })
  const components = new Directory({
    path: 'src/components',
    include: '*.{ts,tsx}',
  })
  const entryGroup = new EntryGroup({
    entries: [docs, components],
  })
  ```

- eda5977: Removes all `*OrThrow` methods from `Directory` and `EntryGroup`. This also exports two new custom errors, `FileNotFoundError` and `FileExportNotFoundError` to handle missing files and exports.

  ### Breaking Changes

  `Directory` and `EntryGroup` no longer have `*OrThrow` methods, use the respective methods instead. To get the same functionality as before, you can catch the error and handle it accordingly:

  ```ts
  import { Directory, FileNotFoundError } from 'renoun/file-system'

  const posts = new Directory({ path: 'posts' })

  posts.getFile('hello-world', 'mdx').catch((error) => {
    if (error instanceof FileNotFoundError) {
      return undefined
    }
    throw error
  })
  ```

### Minor Changes

- fcd11af: Now `Directory#getParent` throws when called for the root directory. This makes the method easier to work with and aligns better with `File#getParent` always returning a `Directory` instance.
- 71aa01f: Adds a default `mdx` loader to `JavaScriptFile` that uses the `MDXRenderer` component. This allows MDX files without imports to be rendered easily:

  ```tsx
  import { Directory } from 'renoun/file-system'

  const posts = new Directory({ path: 'posts' })

  export default async function Page({
    params,
  }: {
    params: Promise<{ slug: string }>
  }) {
    const slug = (await params).slug
    const post = await posts.getFile(slug, 'mdx')
    const Content = await post.getExportValue('default')

    return <Content />
  }
  ```

- 21a952a: Adds `File#getText` method for retrieving the text contents of the file.
- e107c2f: Allows instantiating `File` and `JavaScriptFile` more easily using only a `path`:

  ```ts
  import { JavaScriptFile } from 'renoun/file-system'

  const indexFile = new JavaScriptFile({ path: 'src/index.ts' })
  const indexFileExports = await indexFile.getExports()
  ```

- 3298b6b: Refactors `Generic` kind that can be returned from `JavaScriptFileExport#getType` into two separate `Utility` and `UtilityReference` kinds. This is more explicit in how types are resolved based on where the type resolution starts from.

  ```ts
  // "Partial" is resolved as a "Utility" kind when starting from the type alias
  type Partial<Type> = {
    [Key in keyof Type]?: Type[Key]
  }

  // Whereas "Partial" here is resolved as a "UtilityReference" kind when resolved from within a type
  interface Props<Type> {
    options: Partial<Type>
  }
  ```

- a470c98: Adds an overload to `Directory#getFile` that allows for querying files by their path including the extension instead of needing to provide the extension separately:

  ```ts
  const rootDirectory = new Directory()
  const file = await rootDirectory.getFile('tsconfig.json')
  ```

- 919b73d: Configures the [JavaScript RegExp Engine](https://shiki.style/guide/regex-engines#javascript-regexp-engine) for `shiki`.
- eb6a7f2: The WebSocket server now uses `.gitignore` to ignore watching files instead of a hardcoded array.
- 213cc11: Adds an option for specifying the `port` number when using `createServer` from `renoun/server`:

  ```ts
  import { createServer } from 'renoun/server'

  createServer({ port: 3001 })
  ```

- b82df87: Allows File System type guards (`isDirectory`, `isFile`, `isJavaScriptFile`) to accept `undefined`. This saves from having to check if a file exists before checking its type.
- 37cb7bb: Fixes running multiple renoun WebSocket servers by setting the port to `0` by default. This allows the OS to assign an available port.
- 446effc: Exports `FileSystem`, `MemoryFileSystem`, and `NodeFileSystem` classes for creating custom file systems as well as `Repository` for normalizing git providers.

  ```js
  import { Directory, MemoryFileSystem } from 'renoun/file-system'

  const fileSystem = new MemoryFileSystem({
    'index.mdx': '# Hello, World!',
  })
  const directory = new Directory({ fileSystem })
  ```

### Patch Changes

- 8f64055: Fixes error when adding a file at a previously deleted path by flushing the file deletion immediately.
- 334f859: Fixes duplicate unions appearing in `JavaScriptFileExport#getType`.
- 438dc94: Avoids creating duplicate watchers for the same directory.
- 1cc52b8: Fixes Webpack cache warning from dynamic prettier import by moving to require.
- ce751f1: Fixes non-exported types not being resolved.
- 7b90440: Fixes `getType` erroring when inferring a re-exported type.
- 54eeb9e: Fixes duplicate exports when there are overloads.
- Updated dependencies [c394b9c]
  - @renoun/mdx@1.3.1

## 7.9.0

### Minor Changes

- 3022d63: Renames `Directory` and `File` `getParentDirectory` methods to `getParent` to better align with `getSiblings`. This also aligns more closely with the web File System API's [getParent](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemEntry/getParent) method.

  ### Breaking Changes

  - `Directory.getParentDirectory` is now `Directory.getParent`
  - `File.getParentDirectory` is now `File.getParent`

- ba2d5e1: Adds `pathCasing` option to `Directory` for setting the casing of all path methods. This is useful for ensuring that all paths are in a consistent casing, regardless of the underlying file system.

  ```ts
  import { Directory } from 'renoun/file-system'

  const directory = new Directory({
    path: 'components',
    pathCasing: 'kebab',
  })
  const file = await directory.getFileOrThrow('button')

  file.getPath() // '/button'

  const directory = await directory.getDirectoryOrThrow('card')

  directory.getPath() // '/card'
  ```

- 87e380b: Renames the `MDXContent` component to `MDXRenderer`. This was causing confusion with the `MDXContent` type exported from `renoun/mdx` and better reflects the purpose of the component.

  ### Breaking Changes

  - Rename any `MDXContent` component references from `renoun/components` to `MDXRenderer`.

- 4149b39: Refactors the `Directory` builder pattern to move back to an object configuration with the addition of a new `withSchema` helper, allowing strong type inference and colocated file export type definitions:

  ```ts
  import { Directory, withSchema } from 'renoun/file-system'
  import { z } from 'zod'

  export const Posts = new Directory({
    path: 'posts',
    include: '*.mdx',
    loaders: {
      mdx: withSchema(
        {
          frontmatter: z.object({
            title: z.string(),
            description: z.string(),
            date: z.date(),
            tags: z.array(z.string()).optional(),
          }),
        },
        (path) => import(`@/posts/${path}.mdx`)
      ),
    },
  })
  ```

  Note, some additional changes have also been made:

  - `withModule` has been replaced in favor of a `loaders` option.
  - `withFilter` has been replaced by an `include` option to better align with TypeScript's configuration naming.
  - The new `include` filter now also accepts a string glob file pattern e.g. `*.mdx`.
  - An extension **must** be provided for loaders, this ensures that arbitrary file extensions are not loaded by mistake.
  - [Standard Schema](https://github.com/standard-schema/standard-schema) is now used to automatically infer types from libraries that adhere to the spec (Zod, Valibot, Arktype).
  - The `MDXContent` type is now included by default for MDX file `default` exports.
  - Internally, the `JavaScriptFileWithRuntime` class was collapsed into `JavaScriptFile`. This was originally added to provide strong types when a runtime loader was or was not available, but caused too much complexity. In the future, a runtime loader will be added automatically if not explicitly defined.

  ### Breaking Changes

  The builder pattern configuration for `Directory` has been refactored to use an object configuration with the addition of a new `withSchema` helper. This change is breaking for any existing code that uses the `Directory` builder pattern. The `withSchema` helper is now required to provide strong type inference and colocated file export type definitions.

  #### Before

  ```ts
  import { Directory } from 'renoun/file-system'

  interface PostTypes {
    mdx: {
      default: MDXContent
    }
  }

  const posts = new Directory<PostTypes>('posts').withModule(
    (path) => import(`./posts/${path}`)
  )
  ```

  #### After

  ```ts
  import { Directory } from 'renoun/file-system'

  const posts = new Directory<PostTypes>({
    path: 'posts',
    loaders: {
      mdx: (path) => import(`./posts/${path}.mdx`),
    },
  })
  ```

- 80ae7f2: Marks the `Directory#duplicate` method as private since this was previously only exposed for `EntryGroup` which no longer requires a new instance to be created.
- 1f6603d: Removes `getEditPath` in favor of `getEditUrl` and `getEditorUri` for a more explicit API. Prior, the `getEditPath` method switched between the editor and the git provider source based on the environment. This was confusing and not always the desired behavior. Now you can explicitly choose the behavior you want.

  ### Breaking Changes

  The `getEditPath` method has been removed. Use `getEditUrl` and `getEditorUri` instead.

  To get the same behavior as `getEditPath` you can use both `getEditUrl` and `getEditorUri` together:

  ```ts
  import { Directory } from 'renoun/file-system'

  const directory = new Directory('src/components')
  const file = directory.getFileOrThrow('Button', 'tsx')
  const editUrl =
    process.env.NODE_ENV === 'development'
      ? file.getEditorUri()
      : file.getEditUrl()
  ```

- 97bc268: Renames `@renoun/mdx` `Headings` type to `MDXHeadings`. This adds better clarity and consistency with the other `MDX` prefixed types.

  ### Breaking Changes

  - Rename any `Headings` references from `@renoun/mdx` to `MDXHeadings`.

### Patch Changes

- 5d8bd25: Fixes nested ordered files not using a unique key causing them to be filtered.
- dc323ab: Closes WebSocket connections with a code allowing the Node process to properly exit. More info [here](https://x.com/schickling/status/1869081922846220583).
- 679da2c: Fixes `Directory#getFile` not considering file name modifiers.

  ```ts
  const directory = new Directory({ path: 'components' })
  const file = await directory.getFileOrThrow(['APIReference', 'examples'])

  file.getAbsolutePath() // '/APIReference.examples.tsx'
  ```

- 5b558c1: Fixes `Directory#getFile` not prioritizing base files over files with modifiers e.g. `Button.tsx` over `Button.examples.tsx`.
- Updated dependencies [ece3cc2]
- Updated dependencies [97bc268]
- Updated dependencies [df4d29d]
  - @renoun/mdx@1.3.0

## 7.8.0

### Minor Changes

- 0f069c5: Implements `JavaScriptFile#getExport` as an async method that now resolves the metadata of the export when it is initialized. This removes the need to `await` all methods like `getName`, `getDescription`, and `getTags`. Additionally, this adds a new `JavaScriptFile#hasExport` method for checking if the file has a specific export.
- 9cf4499: Deprecates `Collection`, `CompositeCollection`, `isExportSource`, `isFileSystemSource`, and `isCollectionSource`. These will be removed in the next major version.

  ### Updating to File System utilities

  The `Collection` and `CompositeCollection` classes have been deprecated in favor of the new `renoun/file-system` utilities. The `isExportSource`, `isFileSystemSource`, and `isCollectionSource` functions have also been deprecated.

  To update your code, replace any instances of `Collection` with `Directory` and `CompositeCollection` with `EntryGroup`. For example, the following code:

  ```ts
  import { Collection, CompositeCollection } from 'renoun/collections'

  const docs = new Collection({
    filePattern: '*.mdx',
    baseDirectory: 'docs',
  })
  const components = new Collection({
    filePattern: '*.{ts,tsx}',
    baseDirectory: 'src/components',
  })
  const compositeCollection = new CompositeCollection(docs, components)
  ```

  should be replaced with:

  ```ts
  import { Directory, EntryGroup, isFile } from 'renoun/file-system'

  const docs = new Directory({ path: 'docs' }).filter((entry) =>
    isFile(entry, 'mdx')
  )
  const components = new Directory({ path: 'src/components' }).filter((entry) =>
    isFile(entry, ['ts', 'tsx'])
  )
  const entryGroup = new EntryGroup({ entries: [docs, components] })
  ```

- 95e56e2: Adds `includeDuplicates` option to `Directory#getEntries` that is set to `false` by default. This option allows control over deduplicating entries with the same base name e.g. `Button.mdx` and `Button.tsx`.
- 7d56e9a: Adds `getSlug` method to `Directory`, `File`, and `JavaScriptExport`.
- 3419623: Adds `getExportValue` and `getExportValueOrThrow` methods to `JavaScriptFile` as a shortcut to getting an export's runtime value since this is a common use case.
- 91d9b51: Removes `isFileWithExtension` and reimplements it within `isFile` which now allows an optional second `extension` argument.

  ### Breaking Changes

  To upgrade, replace all instances of `isFileWithExtension` with `isFile`. Previous usage of `isFile` will still work as expected.

- 4279d19: Adds `includeDuplicateSegments` configuration option for `File#getPath` method that is set to `false` by default. This option allows including consecutive duplicate segments in the returned path.
- 92c5dee: Enables passing `tsConfigPath` option to `Directory`.
- 4f843e4: Adds `isJavaScriptFile` and `isJavaScriptFileWithRuntime` type guards for JavaScript-like files.
- 50e094b: Adds `getPosition` and `getText` methods to `JavaScriptExport`.
- c4d274c: Moves the `Directory` `getImport` option to `Directory#withModule`. This provides stronger types for inferring the `getRuntimeValue` method.

  ### Breaking Changes

  Update the `getImport` option to `withModule`:

  ```diff
  export const posts = new Directory<{ mdx: PostType }>({
      path: 'posts',
      schema: { mdx: { frontmatter: frontmatterSchema.parse } },
  --    getImport: (path) => import(`./posts/${path}`),
  })
  ++  .withModule((path) => import(`./posts/${path}`))
  ```

- 87ce75d: Moves the `Directory` `schema` option to `Directory#withSchema`. This aligns with the other recent refactor of `Directory` options.

  ### Breaking Changes

  Update the `schema` option to `withSchema`:

  ```diff
  export const posts = new Directory<{ mdx: PostType }>({
      path: 'posts',
  --    schema: { mdx: { frontmatter: frontmatterSchema.parse } },
  })
  ++  .withSchema('mdx', { frontmatter: frontmatterSchema.parse })
  ```

- 46f0807: Moves the `Directory` `basePath` option to `Directory#withBasePath`. This aligns with the recent refactor of other `Directory` options.

  ### Breaking Changes

  Update the `basePath` option to `withBasePath`:

  ```diff
  export const posts = new Directory<{ mdx: PostType }>({
      path: 'posts',
  --    basePath: 'blog',
  })
  ++  .withBasePath('blog')
  ```

- 8252c4b: Adds `getTitle` method to `Directory` and `FileName` classes.
- 2e7f458: Adds an `EntryGroup` utility to `renoun/file-system` that provides an interface for querying and navigating a group of entries:

  ```ts
  import { Directory, EntryGroup } from 'renoun/file-system'

  interface FrontMatter {
    title: string
    description?: string
    date: string
    tags?: string[]
  }

  interface MDXType {
    frontmatter: FrontMatter
  }

  const posts = new Directory<{ mdx: MDXType }>({
    path: 'posts',
  })
  const docs = new Directory<{ mdx: MDXType }>({
    path: 'docs',
  })
  const group = new EntryGroup({
    entries: [posts, docs],
  })
  const entries = await group.getEntries()
  ```

  Sibling entries can be queried using the `getSiblings` method and passing the `EntryGroup` instance to get the siblings for. This is useful for querying siblings across sets of entries:

  ```ts
  const entry = await group.getEntryOrThrow('Button')
  const siblings = await entry.getSiblings({ entryGroup: group })
  ```

  This also adds `hasEntry` and `hasFile` methods to `Directory` which can be used to check if an entry or file exists in an `EntryGroup`:

  ```ts
  type MDXTypes = { metadata: { title: string } }
  type TSXTypes = { title: string }

  const directoryA = new Directory<{ mdx: MDXTypes }>({
    fileSystem: new VirtualFileSystem({ 'Button.mdx': '' }),
  })
  const directoryB = new Directory<{ tsx: TSXTypes }>({
    path: 'fixtures/components',
  })
  const group = new EntryGroup({
    entries: [directoryA, directoryB],
  })
  const entry = await group.getEntryOrThrow('Button')

  if (directoryA.hasFile(entry, 'mdx')) {
    entry // JavaScriptFile<MDXTypes>
  }
  ```

- da0ca4a: Adds `getDepth` method to `Directory` and `File`.
- 1d62855: Fixes ts config exclude paths not being respected when using a relative path.
- be4c6ae: Normalizes the `File#getDirectory` method to return an async value similar to `Directory`.
- 155f2e7: Renames file system methods `filter` to `withFilter` and `sort` to `withSort` for better clarity since they are not immediately applied.

  ### Breaking Changes

  - `Directory#filter` method is now `Directory#withFilter`
  - `Directory#sort` method is now `Directory#withSort`

- 6e599bb: Adds `includeGitIgnoredFiles` and `includeTsConfigIgnoredFiles` options to `Directory#getEntries`. These options allow you to include files that are ignored by `.gitignore` and `tsconfig.json` respectively.
- 66f8289: Adds the ability to specify only the `path` when initializing a `Directory` instance since this is the most common use case:

  ```ts
  import { Directory } from 'renoun/file-system'

  const directory = new Directory('path/to/directory')
  ```

  For more advanced use cases, you can still specify the `options`:

  ```ts
  import { Directory, MemoryFileSystem } from 'renoun/file-system'

  const fileSystem = new MemoryFileSystem({
    'Button.tsx': 'export const Button = () => {}',
  })
  const directory = new Directory({
    path: 'path/to/directory',
    fileSystem,
  })
  ```

### Patch Changes

- 20d3bc5: Fixes an issue in the `Directory#getFile` method where the `entry` variable was not reset in each iteration of the while loop. This caused incorrect file resolutions when searching for nested files.
- c29192b: Fixes nested files being ordered before directory when using `Directory#getEntries`. Now the directory will be ordered first by default before its descendants.
- ce32d36: Fixes analyzing barrel file exports.
- bb20d7e: Fixes duplicate file exports being returned. This was specifically happening when a file export attached a member to the function implementation:

  ```tsx
  export function CodeBlock() {
    // ...
  }

  CodeBlock.displayName = 'CodeBlock' // This caused the file to be exported twice
  ```

- 76b2c80: Fixes package import error if `prettier` is not installed.
- 23aba08: Fixes `Directory` and `File` `getSiblings` method not using a unique identifier to find a matching entry.
- 97799b3: Fixes `Directory#getFile` not considering extensions.
- f2326fd: Fixes `Directory#getFile` not considering extension when provided and matching a directory.
- 50d8760: Fixes `VirtualFileSystem` not respecting provided files order.
- f011668: Fixes `isDirectory` type guard inference.
- 3da8602: Fixes not being able to set tsconfig `compilerOptions` to use `verbatimModuleSyntax`.
- c160fba: Fixes filtering of `Directory` entries based on tsconfig `exclude` field.

## 7.7.0

### Minor Changes

- a1aa042: Removes managing of auto-generated dynamic imports for collections as this was causing issues with build processes.

### Patch Changes

- f2e5608: Fixes `getAbsolutePath` and `getEditPath` for `Directory`.
- c59cd9c: Normalizes `pathSegments` to remove order prefix.
- 784945a: Normalizes incoming `path` for `readDirectory` in `VirtualFileSystem` to match Node.js behavior.

## 7.6.0

### Minor Changes

- 0c67c7c: Removes `isJavaScriptFile` type guard in favor of `isFileWithExtension` that narrows types better.
- bf56af0: Adds support for passing `JavaScriptFile` and `JavaScriptFileExport` to the `APIReference` component.
- 4fc9781: Returns a `JavaScriptExport` instance now from `getExports` to align with `getExport`.
- 73bb769: Adds Fast Refresh to `<JavaScriptExport>.getRuntimeValue` for Next.js.
- 3eec7ff: Removes `getDirectories` and `getFiles` from `Directory` now that the `filter` method is available:

  ```ts
  import { Directory, isFileWithExtension } from 'renoun/file-system'

  const directory = new Directory()
  const files = directory
    .filter((entry) => isFileWithExtension(entry, ['ts', 'tsx']))
    .getEntries()
  ```

- 5390b16: Removes `File#hasExtension` method in favor of the `isFileWithExtension` type guard to consolidate the API.

### Patch Changes

- 8d2b7f3: Fixes the `Directory#getEntries` method `recursive` option not considering nested entries.

## 7.5.0

### Minor Changes

- abb441d: Improves error handling for the `CodeBlock` component when falsey values are provided.
- 0b6e426: Adds `sort` method to `Directory` to allow sorting all entries within each directory:

  ```ts
  import { Directory, isFileWithExtension } from 'renoun'

  type PostType = { frontmatter: { title: string } }

  const posts = new Directory<{ mdx: PostType }>({ path: 'posts' })
    .filter((entry) => isFileWithExtension(entry, 'mdx'))
    .sort(async (a, b) => {
      const aFrontmatter = await a.getExport('frontmatter').getRuntimeValue()
      const bFrontmatter = await b.getExport('frontmatter').getRuntimeValue()

      return aFrontmatter.title.localeCompare(bFrontmatter.title)
    })

  const files = await posts.getEntries() // JavaScriptFile<PostType>[] sorted by front matter title
  ```

- cac71c1: Improves `<VirtualFileSystem>.transpileFile` error handling.
- 2c55b51: Adds `filter` method to `Directory` to allow filtering all entries within each directory:

  ```ts
  import { Directory, isFileWithExtension } from 'renoun'

  type PostType = { frontmatter: { title: string } }

  const posts = new Directory<{ mdx: PostType }>({ path: 'posts' }).filter(
    (entry) => isFileWithExtension(entry, 'mdx')
  )

  const files = await posts.getEntries() // JavaScriptFile<PostType>[]
  ```

- 40c6cdd: Scopes `VirtualFileSystem` using a `projectId` added to the base `FileSystem` class. This ensures the TypeScript project is unique to the virtual file system it is instantiated with.

### Patch Changes

- 1c77620: Fixes the `Directory#getEntries` method `recursive` option to only recurse in `getEntries` instead of the file system.

## 7.4.0

### Minor Changes

- e71de2f: Adds `shouldFormat` prop to `CodeBlock` component to allow disabling code formatting. This is useful for MDX code blocks that are already formatted by an IDE or CI environment.

  ```tsx
  export function useMDXComponents() {
    return {
      pre: (props) => {
        return <CodeBlock shouldFormat={false} {...restProps} />
      },
    }
  }
  ```

- f44b9c5: Adds support for passing an array to `isFileWithExtension` and `File#hasExtension`.

### Patch Changes

- bf0c510: Fixes File System `recursive` options not calculating the appropriate relative paths.
- eab583f: Explicitly sets the prettier `parser` option instead of relying on inference from `filepath` to avoid false-positive errors when parsing code blocks without a provided `filename`.

## 7.3.0

### Minor Changes

- 4c1f7d5: Adds `recursive` option to `getEntries`, `getDirectories`, and `getFiles`.
- ff8d9ae: Implements `getType` for `JavaScriptFileExport`.

### Patch Changes

- 51506d8: Fixes internal `resolveType` utility trimming the `filePath` in `getType` incorrectly.
- d83d265: Fixes order prefixes being added to File System `getPath` methods.

## 7.2.0

### Minor Changes

- 9d67bdf: Add `getFiles` and `getDirectories` to `Directory`.
- 1bd1de3: Adds `hasExtension` method to `File` to help constrain the type:

  ```ts
  import { Directory } from 'renoun/file-system'

  const posts = new Directory<{
    mdx: { frontmatter: { title: string } }
  }>({
    path: 'posts',
  })

  const mdxFiles = await posts
    .getFiles()
    .filter((post) => post.hasExtension('mdx'))
  ```

- 4d263fe: Add `includeIndexAndReadme` option to `getEntries` for controlling default filtering of `index` and `readme` files.
- e09a837: Adds `isFileWithExtension` utility:

  ```ts
  const fileSystem = new VirtualFileSystem({
    'Button.tsx': '',
  })
  const directory = new Directory<{ tsx: { metadata: {} } }>({
    fileSystem,
  })
  const file = await directory.getFileOrThrow('Button')

  if (isFileWithExtension(file, 'tsx')) {
    // file is typed as File<{ tsx: { metadata: {} } }>
  }
  ```

- a36058f: Add `getEditPath` method to `JavaScriptFileExport`.

## 7.1.0

### Minor Changes

- 16a475f: Adds javascript file export metadata to `renoun/file-system`:

  ```tsx
  import { VirtualFileSystem, Directory } from 'renoun/file-system'

  const fileSystem = new VirtualFileSystem({
    'index.ts': `/**\n * Say hello.\n * @category greetings\n */\nexport default function hello() {}`,
  })
  const directory = new Directory({ fileSystem })
  const file = await directory.getFileOrThrow('index', 'ts')
  const fileExport = file.getExport('default')

  await fileExport.getName() // 'hello'
  await fileExport.getDescription() // 'Say hello.'
  await fileExport.getTags() // [{ name: 'category', value: 'greetings' }]
  ```

### Patch Changes

- e1b908e: Removes `async` modifier for `CodeInline` component to prevent type errors.

## 7.0.0

### Major Changes

- 90bbe5b: Simplifies how `baseDirectory` works for `Collection`. This was from a legacy implementation that was not well thought out and caused confusion. This change makes it more explicit and easier to understand.

  ### Breaking Changes

  The `baseDirectory` option for `Collection` is now required to be separate from `filePattern`:

  ```diff
  import { Collection } from 'renoun/collections'

  const components = new Collection({
  --  filePattern: 'src/components/**/*.ts',
  ++  filePattern: '**/*.ts',
  --  baseDirectory: 'components',
  ++  baseDirectory: 'src/components',
  })
  ```

- 93da61f: Introduces more performant, type-safe file system from utilities exported from `renoun/file-system` to replace the `renoun/collections` API, which will be removed in a future major release.

  - **New Classes:**
    - `NodeFileSystem`, `VirtualFileSystem`, `Directory`, `File`, `JavaScriptFile`, and `JavaScriptFileExport`.
  - **Improvements:**
    - Optimized performance, stronger TypeScript support, and in-memory support with `VirtualFileSystem`.

  ### Migration Example

  **Before:**

  ```typescript
  const collection = new Collection({
    filePattern: 'src/**/*.{ts,tsx}',
    baseDirectory: 'src',
  })
  const sources = await collection.getSources()
  ```

  **After:**

  ```typescript
  const directory = new Directory({ path: 'src' })
  const entries = await directory.getEntries()
  ```

  The new file system utilities offer clearer APIs, better performance, and improved developer experience. This is still experimental and API parity with the old collections API is still in progress. Please report any issues you encounter.

- 7cbb112: Updates the `<Collection>.getSource` method to be asynchronous and return a `Promise` that resolves to the source. This allows for more flexibility for a source to communicate with the web socket server.

  ### Breaking Changes

  The `getSource` method for a `Collection` and `CompositeCollection` now returns a `Promise` that resolves to the source. This means that you will need to `await` the result when calling this method:

  ```diff
  import { Collection } from 'renoun/collections'

  const posts = new Collection({
    filePattern: 'posts/*.mdx',
  })

  export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  --  const post = posts.getSource(params.slug)
  ++  const post = await posts.getSource(params.slug)

    if (!post) {
      return <div>Post not found</div>
    }

    const Content = await post.getExport('default').getValue()

    return <Content />
  }
  ```

### Minor Changes

- b2ba1e4: Adds `renoun/server` export for more control of running the WebSocket server. For example, in Next.js this can be used with the `instrumentation.ts` file:

  ```ts
  import { createServer } from 'renoun/server'

  export async function register() {
    if (
      process.env.NODE_ENV === 'development' &&
      process.env.NEXT_RUNTIME === 'nodejs'
    ) {
      createServer()
    }
  }
  ```

### Patch Changes

- 359e5e7: Fixes `APIReference` component not allowing `FileSystemSource`.
- ef4448e: Fixes client and server collections getting out of sync causing an error when resolving types from updated files.
- 7020585: Updates all dependencies to latest version.
- Updated dependencies [7020585]
  - @renoun/mdx@1.2.1

## 6.1.0

### Minor Changes

- cd963a0: Marks pseudo-private methods in collection classes as these are not meant to be used publicly and will not adhere to semver.
- 7642f56: Filters out private class members that start with `#` or `_` when using `<Export>.getType()`.

### Patch Changes

- 72a2e98: Fixes specifying a `language` for inline MDX code.
- eca091b: Fixes constraint text in generated generics text.
- 6753e12: Waits for any active refreshing source files before resolving types.
- 9ac5434: Fixes bug in `CodeBlock` when targeting renoun filenames. The `CodeBlock` source files now use a unique identifier that does not clash with renoun exports.
- 619abd9: Fixes class type resolution not accounting for filter and file dependencies.
- Updated dependencies [72a2e98]
  - @renoun/mdx@1.2.0

## 6.0.0

### Major Changes

- 0e6279a: Removes the deprecated `collection` function.

  ### Breaking Changes

  The `collection` function has been removed. You can now use the `Collection` class directly to create a collection:

  ```tsx
  import { Collection } from 'renoun/collections'

  const posts = new Collection({
    filePattern: 'posts/*.mdx',
  })
  ```

### Minor Changes

- ebdfb16: Adds `getFileSystemPath` method to `FileSystemSource` and `ExportSource` to allow getting types for a file in `APIReference`.
- 489960a: Adds the ability to specify the set of languages loaded for syntax highlighting using the `languages` field in the `renoun.json` configuration file. This allows you to reduce the bundle size by only loading the languages you need:

  ```json
  {
    "languages": ["sh", "ts", "tsx"]
  }
  ```

- ed8fb6a: Adds support for formatting the `CodeBlock` component source text using `prettier` if it is available to the workspace.

### Patch Changes

- cab837b: Fixes issue with trying to format dynamic imports added to collections from CLI causing issues with linters. Now, formatting will only occur if the workspace has access to `prettier`.

## 5.5.0

### Minor Changes

- 555815e: Adds a cache to the `<ExportSource>.getType` method to prevent unnecessary processing of types since this is an expensive operation. Types will now only be resolved the first time they are requested and then cached for subsequent requests unless one of the file dependencies has changed.

### Patch Changes

- c8760f7: Runs initial script to write collections in parallel when starting the dev server. This needed to run synchronously in a previous implementation.
- d6c374b: Handles CLI sub-process clean up better if an error in the WebSocket server occurs.

## 5.4.0

### Minor Changes

- f37e6e1: Adds support for analyzing generic parameters.
- 09e4efd: Adds initial support for analyzing class member decorators.

### Patch Changes

- 72697ee: Makes sure to update `Collection` new expressions with the related dynamic import.
- 00d64e2: Improves errors that can occur during type resolution.
- 9c86e10: Fixes collection exports generic parameter to not be overconstrained.

## 5.3.0

### Minor Changes

- 6a74c71: Deprecates the `collection` utility in favor of using the `Collection` class directly:

  ```diff
  -- import { collection } from 'renoun/collections'
  ++ import { Collection } from 'renoun/collections'

  -- export const PostsCollection = collection({
  ++ export const PostsCollection = new Collection({
    filePattern: 'posts/*.mdx',
    baseDirectory: 'posts',
    basePath: 'posts',
  })
  ```

- ad250de: Introduces a new `CompositeCollection` class. This allows grouping a set of collections to treat them as a single collection:

  ```tsx
  import { Collection, CompositeCollection } from 'renoun/collections'

  const CollectionsCollection = new Collection({
    filePattern: 'src/collections/index.tsx',
    baseDirectory: 'collections',
  })

  const ComponentsCollection = new Collection({
    filePattern: 'src/components/**/*.{ts,tsx}',
    baseDirectory: 'components',
  })

  const AllCollections = new CompositeCollection(
    CollectionsCollection,
    ComponentsCollection
  )
  ```

  When getting a source from a composite collection, the `<FileSystemSource>.getSiblings` method will account for all collections in the composite collection:

  ```tsx
  const source = AllCollections.getSource('collections/index')!

  const [previousSource, nextSource] = await source.getSiblings()
  ```

  A new `<Collection>.hasSource` type guard is also available to help constrain the type of the source when working with composite collections:

  ```tsx
  if (ComponentsCollection.hasSource(nextSource)) {
    // nextSource is now typed as a ComponentsCollection source
  }
  ```

- f499a2b: Adds support to `<ExportSource>.getType()` for capturing API references that use index types.
- 8822ce6: Adds an initial highlight animation of all symbols when the pointer enters the `CodeBlock`.
- fc1e9a6: Adds support for passing a file path to the `APIReference.source` prop:

  ```tsx
  import { APIReference } from 'renoun/components'

  export function FilePath() {
    return (
      <APIReference
        source="./GitProvider.tsx"
        workingDirectory={import.meta.url}
      />
    )
  }
  ```

### Patch Changes

- 53ad975: Moves image mask to code element when using `CodeBlock.focusedLines` prop to prevent dimming the border and copy button.
- c35be54: Fixes CLI errors not bubbling correctly during local development.
- 508d086: This update resolves several issues with API references, particularly recursion bugs in the internal `resolveType` utility. The key changes involve an updated algorithm for computing component types, which affects the following case:

  - Named functions with a capitalized first letter and a single non-object argument are now interpreted as components when they should be functions. This is an unintended behavior change and will be corrected in an upcoming update.

  ### Type References

  Type references are now split into two maps that serve the following use cases:

  - **Prevent Infinite Recursion**: A map of type references is maintained during type iteration of the root type to prevent infinite recursion.
  - **Optimized Type Handling for Exported Declarations**:
    - Adds an explicit map for tracking exported declarations to avoid type duplication.
    - Improves performance and establishes a link between types.

- a8b77df: Updates `renoun/assets` with the latest logos.
- fc2cc02: Allows `CodeInline` to stretch by anchoring the `CopyButton` to the end.
- 2e75254: Adds better error messaging with actions to take when `CodeBlock` or `CodeInline` has diagnostic errors.

## 5.2.0

### Minor Changes

- 6fc89d2: Adds `filter` prop to `APIReference` component.
- d6cdba2: Adds declaration file path to symbol metadata for use when filtering API references.

### Patch Changes

- a753254: Fixes filtered types being treated as reference types when generating API references.

## 5.1.0

### Minor Changes

- 7b6dc4a: Moves type reference resolution to the `renoun` cli process. This offers a few benefits:

  - Faster page loads in development where the `APIReference` component is used since it now utilizes a `Suspense` boundary
  - Cross-references between types are now supported which will allow linking type references across pages

### Patch Changes

- 6b321e3: Fixes excessive `CodeBlock` vertical scroll area on mobile Safari.
- dd1db4c: Improve readability for WebSocket params in error messages.
- ca95e54: Adds named functions to web socket methods for better debuggability.

## 5.0.0

### Major Changes

- 1c4c390: Moves `MDXContent` and `MDXComponents` type exports to `@renoun/mdx` package.
- 5fa1a9e: Renames `createCollection` to `collection`.

  ### Breaking Changes

  Replace all instances of `createCollection` with `collection`:

  ```diff
  -import { createCollection } from 'renoun/collections'
  +import { collection } from 'renoun/collections'

  -const PostsCollection = createCollection({
  +const PostsCollection = collection({
    filePattern: 'posts/*.mdx',
  })
  ```

- f5ecc15: Removes `getDefaultExport` and `getNamedExport` from collection export sources in favor of a new `getExport` method. This method works exactly the same as the previous `getNamedExport` method with the addition of accepting `default` as an export. This simplifies the API and reduces the number of methods needed to query an export source.

  ### Breaking Changes

  Update any usage of `getDefaultExport` and `getNamedExport` to use the new `getExport` method:

  - `getDefaultExport()` -> `getExport('default')`
  - `getNamedExport('metadata')` -> `getExport('metadata')`

### Minor Changes

- 5cdff4d: Adds `@renoun/mdx` to core `renoun` package as a `renoun/mdx` export. The `@renoun/mdx` package was initially split off to make maintenance easier. Since renoun is catering to content authoring, the MDX features should be as easy as possible to use.

### Patch Changes

- 482e1e4: Fixes fast refresh when using a custom JSX pragma.
- 78080ed: Fixes fast refresh for collections targeting files outside of workspace.
- abca1f8: Fixes package manager tab panel layout shift on page load.
- 7e58c6d: Adds better error handling to internal CLI `WebSocketClient`.
- 5da3781: Fixes watch command running during deployments.
- Updated dependencies [1c4c390]
- Updated dependencies [b9d52a3]
  - @renoun/mdx@1.1.0

## 4.3.0

### Minor Changes

- ff7665e: Moves import map generation from the `.renoun` directory to the second argument of the `createCollection` call expression. This will automatically be updated to the new `filePattern` argument and generate the import getter for each collection:

  ```ts
  import { createCollection } from 'renoun/collections'

  export const DocsCollection = createCollection(
    {
      filePattern: 'docs/**/*.mdx',
      baseDirectory: 'docs',
      basePath: 'docs',
    },
    (slug) => import(`docs/${slug}.mdx`)
  )
  ```

  This reduces a lot of boilerplate and configuration. Previously, the `.renoun` directory needed to be generated, added to `.gitignore`, and then the server needed to be restarted after the first initialization. Now, import maps are colocated with their respective collection configuration.

- a484f7e: Adds support for Vite by utilizing the package.json `imports` field when the workspace is a module.

### Patch Changes

- 2f4837b: Prevents error when tsconfig `exclude` field is not defined.
- d49606d: Adds `baseUrl` field if it does not exist when code-modding tsconfig to add the path alias.
- 46e463f: Fixes `PackageInstall` component warning showing when not being used.
- 8621338: Uses CJS compatible imports to fix bundlers like Vite that will end up with `undefined` imports.

## 4.2.0

### Minor Changes

- 2d64da1: Adds a `PackageInstall` component for displaying a list of package manager install commands that can be copied.

### Patch Changes

- 2ad1db1: Removes unused `createCollection` `title` and `label` options.
- 779df0a: Adds better error when trying to create a collection within a route group file pattern that needs to be escaped properly.
- 170d382: Fixes error when collection `baseDirectory` does not have any additional segments after normalizing file paths.

## 4.1.0

### Minor Changes

- 9f6c0f2: Moves config from `.renoun/config.json` to `renoun.json`. See [configuration docs](https://www.renoun.dev/docs/getting-started) for more information.
- 1a71061: Moves `renoun` package to ESM only. To upgrade in Next.js projects, modify the `next.config.js` file to include the following in the webpack `extensionAlias` configuration:

  ```js
  export default {
    webpack(config) {
      config.resolve.extensionAlias = {
        '.js': ['.ts', '.tsx', '.js'],
      }

      // ...

      return config
    },
  }
  ```

- 3c78b3e: Adds the ability to filter export sources when creating a collection:

  ```tsx
  import {
    createCollection,
    isFileSystemSource,
    isExportSource,
  } from 'renoun/collections'

  export const ComponentsCollection = createCollection<
    Record<string, React.ComponentType>
  >('src/components/**/*.{ts,tsx}', {
    baseDirectory: 'components',
    basePath: 'components',
    filter: (source) => {
      if (isFileSystemSource(source)) {
        if (source.isFile()) {
          const allInternal = source
            .getExports()
            .every((exportSource) =>
              exportSource.getTags()?.every((tag) => tag.tagName === 'internal')
            )

          if (allInternal) {
            return false
          }
        }
      }

      if (isExportSource(source)) {
        if (source.getTags()?.find((tag) => tag.tagName === 'internal')) {
          return false
        }
      }

      return true
    },
  })
  ```

### Patch Changes

- aaf965c: Collections now respect the tsconfig `ignore` field if defined and will filter out sources that should be ignored.
- e40258a: Fixes large font sizes on mobile devices. See [this article](https://maxleiter.com/blog/mobile-browsers-resizing-font) for more info.
- bf684ca: Fixes svg warning for logo asset.
- af07785: Uses css container padding for `CodeBlock` internal padding if defined.
- d207ecc: Fixes `CodeBlock` `highlightedLines` regression.
- cb3843c: Fixes suspense fallback layout shift during local development.
- 700969a: Normalizes custom `CodeBlock` padding values to offset `CopyButton` correctly.

## 4.0.0

### Major Changes

- 8e1a7e1: Renames the package from `omnidoc` to `renoun`.

## 3.2.1

### Patch Changes

- 677d117: Clean up formatting for source export errors.
- 830724b: Prevents exiting the process in development when the collection does not target valid directories or source files to allow fixing without restarting the server.

## 3.2.0

### Minor Changes

- c017f16: Adds `@renoun/mdx` package that includes pre-configured and custom `remark` and `rehype` plugins.
- a2f85cb: Adds `filter` option to `createCollection` for filtering by specific file system sources.

### Patch Changes

- 8267207: Adds better error handling when trying to update the project based on a file system change.

## 3.1.1

### Patch Changes

- 622c1c4: Use newer version of pnpm to fix catalog on publish.

## 3.1.0

### Minor Changes

- 4c29cdc: Removes `getTitle` method for collection source.
- 9b4fe41: Adds `getTags` method to collection export source that returns the relative JS Doc tags if they exist.

### Patch Changes

- ac6ce1c: Always clean up sub-process in close event when using cli.
- 365a2c3: The `getText` method for a collection export source now includes the full context of everything used within the export.
- 1b6d65a: Adds better title parsing for file system and export source names.
- 43e379c: Adds `.git` to default ignored list for projects.
- 1a4888b: Removes the `sourcePath` prop from the `CodeBlock` component which was previously only used with the MDX plugins and Webpack loader.
- 0b00c1a: Fixes `getEditPath` not trimming the working directory in production.

## 3.0.1

### Patch Changes

- d964f0f: Fixes `getRootDirectory` not accounting for non-monorepos and returns the first directory where a `package.json` file was found.
- d50ff0d: Reverts `fixMissingImports` as it is causing incorrect imports to be added.

## 3.0.0

### Major Changes

- eb8d77e: Renames the package from `mdxts` to `renoun`.

## 2.0.1

### Patch Changes

- 39be366: Fixes `MDXContent` component causing `_jsx is not a function` during development.
- 5504a76: Replaces `@manypkg/find-root` with simplified utility for getting the root directory.
- b7b664c: Adds `allowErrors` prop to `CodeInline`.
- 31e00c5: Trims empty export from copy value.
- 08d47ec: Fix imports in `CodeBlock` to capture correct types.

## 2.0.0

### Major Changes

- 98c68a3: Removes `mdxts/next` package export. This is an effort to simplify the core package and reduce the number of dependencies. This functionality will be available in a separate package in the future.

  ### Breaking Changes

  If using Next.js, this is a breaking change for users who are importing `mdxts/next` directly. The following configuration can be used to enable MDX support and silence warnings from the `ts-morph` dependency:

  ```ts
  import createMDXPlugin from '@next/mdx'
  import remarkFrontmatter from 'remark-frontmatter'
  import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
  import webpack from 'webpack'

  const withMDX = createMDXPlugin({
    extension: /\.mdx?$/,
    options: {
      remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter],
    },
  })

  export default withMDX({
    pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
    webpack(config) {
      config.plugins.push(
        new webpack.ContextReplacementPlugin(
          /\/(@ts-morph\/common)\//,
          (data) => {
            for (const dependency of data.dependencies) {
              delete dependency.critical
            }
            return data
          }
        )
      )

      return config
    },
  })
  ```

  Then add or update the `mdx-components.tsx` file in the root of the project to set up the code components:

  ```tsx
  import { MDXComponents } from 'mdx/types'
  import { CodeBlock, CodeInline } from 'mdxts/components'

  export function useMDXComponents() {
    return {
      code: (props) => {
        return (
          <CodeInline value={props.children as string} language="typescript" />
        )
      },
      pre: (props) => {
        const { value, language } = CodeBlock.parsePreProps(props)
        return <CodeBlock allowErrors value={value} language={language} />
      },
    } satisfies MDXComponents
  }
  ```

- 98c68a3: Removes `createSource` in favor of using `createCollection` from `mdxts/collections`.

  ### Breaking Changes

  Use `createCollection` to generate sources:

  ```tsx
  import { createCollection, type FileSystemSource } from 'mdxts/collections'

  type ComponentSchema = Record<string, React.ComponentType>

  export type ComponentSource = FileSystemSource<ComponentSchema>

  export const ComponentsCollection = createCollection<ComponentSchema>(
    'src/components/**/*.{ts,tsx}',
    {
      baseDirectory: 'components',
      basePath: 'components',
      tsConfigFilePath: '../../packages/mdxts/tsconfig.json',
    }
  )
  ```

- 98c68a3: Removes `Navigation` component in favor of using `createCollection` directly.

  ### Breaking Changes

  Use `createCollection` to generate navigations:

  #### List Navigation

  Use `getSources` to render a list of the immediate sources in the collection:

  ```tsx path="app/posts/page.tsx"
  export default async function Page() {
    return (
      <>
        <h1>All Posts</h1>
        <ul>
          {PostsCollection.getSources().map((source) => (
            <Post key={source.getPath()} source={source} />
          ))}
        </ul>
      </>
    )
  }
  ```

  #### Tree Navigation

  Similar to list navigation, we can use `getSources` recursively to render a tree of links:

  ```tsx path="app/posts/layout.tsx"
  import { PostsCollection } from '@/collections'

  export default async function Layout() {
    return (
      <nav>
        <ul>
          <TreeNavigation Source={PostsCollection} />
        </ul>
      </nav>
    )
  }

  async function TreeNavigation({ source }: { source: PostSource }) {
    const sources = source.getSources({ depth: 1 })
    const path = source.getPath()
    const depth = source.getDepth()
    const frontmatter = await source.getNamedExport('frontmatter').getValue()

    if (sources.length === 0) {
      return (
        <li style={{ paddingLeft: `${depth}rem` }}>
          <Link href={path} style={{ color: 'white' }}>
            {frontmatter.title}
          </Link>
        </li>
      )
    }

    const childrenSources = sources.map((childSource) => (
      <TreeNavigation key={childSource.getPath()} source={childSource} />
    ))

    if (depth > 0) {
      return (
        <li style={{ paddingLeft: `${depth}rem` }}>
          <Link href={path} style={{ color: 'white' }}>
            {frontmatter.title}
          </Link>
          <ul>{childrenSources}</ul>
        </li>
      )
    }

    return <ul>{childrenSources}</ul>
  }
  ```

  #### Sibling Navigation

  Use `getSiblings` to get the previous and next sources in the collection:

  ```tsx path="app/posts/[slug]/page.tsx"
  export default async function Page({ params }) {
    const postSource = Posts.getSource(params.slug)

    if (!postSource) notFound()

    const Post = await postSource.getDefaultExport().getValue()
    const frontmatter = await postSource
      .getNamedExport('frontmatter')
      .getValue()
    const [previous, next] = postSource.getSiblings()

    return (
      <>
        <h1>{frontmatter.title}</h1>
        <p>{frontmatter.description}</p>
        <Post />
        {previous ? <Sibling source={previous} direction="previous" /> : null}
        {next ? <Sibling source={next} direction="next" /> : null}
      </>
    )
  }

  function Sibling({
    source,
    direction,
  }: {
    source: ReturnType<typeof Posts.getSource>
    direction: 'previous' | 'next'
  }) {
    const frontmatter = await source.getNamedExport('frontmatter').getValue()
    return (
      <a href={source.getPath()}>
        <span>{direction === 'previous' ? 'Previous' : 'Next'}</span>
        {frontmatter.title}
      </a>
    )
  }
  ```

### Minor Changes

- 98c68a3: Adds remaining configuration options from `next/plugin` to JSON config.
- 98c68a3: Adds `getSiblings` method to collection export source.
- 98c68a3: Adds `getType` method to collection export source for retrieving type metadata for an export.
- 98c68a3: Adds `APIReference` component. This replaces the previous `ExportedTypes` component and is used to document the API of module exports using collections:

  ```tsx
  import { APIReference } from 'mdxts/components'
  import { createCollection } from 'mdxts/collections'

  const ComponentsCollection = createCollection('components/**/*.{ts,tsx}', {
    baseDirectory: 'components',
    basePath: 'components',
  })

  export default function Component({ params }) {
    return ComponentsCollection.getSource(params.slug)
      .getExports()
      .map((exportSource) => (
        <APIReference key={exportSource.name} source={exportSource} />
      ))
  }
  ```

- 98c68a3: `CodeBlock` now tries to parse `workingDirectory` as a `URL` and gets the pathname directory. This allows using `import.meta.url` directly in the `workingDirectory` prop:

  ```tsx
  <CodeBlock
    source="./counter/useCounter.ts"
    workingDirectory={import.meta.url}
  />
  ```

- 98c68a3: Adds `getMainExport` for file system source and `isMainExport` for export source.

### Patch Changes

- 98c68a3: Fixes collection file system source name parsing not accounting for filename segments.
- 98c68a3: Fixes missing bottom padding in `CodeInline`.
- 98c68a3: Fixes syncing project files during development.
- 98c68a3: Fixes import map generation race condition causing imports to not be found during production builds.
- 98c68a3: Fixes export source `getPath` to construct the url path from the file system.
- 98c68a3: Defaults collection `getSource` to return `index` source if it exists.
- 98c68a3: Fixes file patterns based on relative tsconfig directory.
- 98c68a3: Fixes duplicate sources returned from collection `getSources` and file system source `getSiblings`.

## 1.8.0

### Minor Changes

- 3378b26: Adds support for defining schemas for collections:

  ```tsx
  import { createCollection, type MDXContent } from 'mdxts/collections'
  import { z } from 'zod'

  const frontmatterSchema = z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })

  export const PostsCollection = createCollection<{
    default: MDXContent
    frontmatter: z.infer<typeof frontmatterSchema>
  }>('posts/*.mdx', {
    baseDirectory: 'posts',
    schema: {
      frontmatter: frontmatterSchema.parse,
    },
  })
  ```

- 53bfeb8: Moves all `CodeBlock` components to use `restyle` and exposes a `css` prop for each component to allow overriding styles.

### Patch Changes

- 361b420: Improves error messaging when working with collection utilities.
- 3207ce0: Adds export for `frontmatter` from MDX files when using `mdx-plugins`.
- 598bd9c: Fixes `getEditPath` for export source in local development.
- 38b7b4b: Fixes caching implementation for shiki highlighter.
- e401fe0: Updates collection import map during development when adding, removing, or editing collections.
- 400384a: Inherit background color in code element in `CodeBlock` to prevent global styles leaking in.

## 1.7.1

### Patch Changes

- f7c488d: Fix fast refresh for all component exports.
- b7e68af: Fixes relative collection file patterns and ts config paths causing incorrect import map path generation.
- 0dad0d3: Fixes error when trying to refresh file that hasn't been loaded into the project yet.
- 4db37c9: Generates `ts` file instead of `js` file for aliased collection import map.

## 1.7.0

### Minor Changes

- abe2d84: Add `deprecated` tag to `createSource` in favor of `createCollection`.
- 71384b3: Generates import map in `.mdxts` directory when initially running Next.js plugin.
- 9dca168: Remove `CodeBlock` syntax formatting until a better solution can be implemented that doesn't throw console warnings.

### Patch Changes

- c545243: Updates shiki from deprecated `getHighlighter` to `createHighlighter`.
- b76908a: Fixes missing directory error when removing directory and regenerating the import map.
- 5628c89: Retry connecting to the WebSocket server from the client if it gets disconnected.
- ac4006a: Keeps project files for code blocks in sync with changes to the file system.
- d0a285f: Throw more helpful error if both the cli and Next.js plugin are being used together.

## 1.6.4

### Patch Changes

- b350e9f: Remove unused dependencies and fix rehype types.
- d0ab9a3: Update dependencies.

## 1.6.3

### Patch Changes

- 732799f: Upgrade restyle to `2.0.2`.
- 4ecd7b5: Adds `getDescription` method to export source.
- e5fc9bf: Adds `isFile` and `isDirectory` helper methods to collection source.
- 7e461f0: Removes `getPathSegments` from collection in favor of using source `getPathSegments`.

## 1.6.2

### Patch Changes

- 2ad7cee: Moves to an options object for `getSources` and `getSiblings`.

  ```diff
  - source.getSources(1);
  + source.getSources({ depth: 1 });

  - source.getSiblings(0);
  + source.getSiblings({ depth: 0 });
  ```

- 6b52578: Uses directory name for collection source if it is an index or readme file.
- ff66a21: Returns entire variable declaration for `getText` method.
- c0d7a2d: Adds `getPathSegments` to collections.
- 699218b: Allow passing `index` or `readme` to `getSource` for collections.
- 1db78ec: Renames `getNamedExports` to `getExports` to better reflect that the default export is included.

## 1.6.1

### Patch Changes

- 85f528d: Fixes constraint type error when using an interface with `FileSystemSource` or `createCollection`.

## 1.6.0

### Minor Changes

- 252f4c4: This adds an `mdxts` cli command to allow running the project analysis in a separate process to improve overall performance during local development.

  ## CLI

  This can be prepended to your framework's development process e.g. `next dev`. For example, to start the `mdxts` process prior to starting the Next.js server simply prepend the `mdxts` command:

  ```json
  {
    "scripts": {
      "dev": "mdxts next",
      "build": "mdxts next build"
    }
  }
  ```

  This ensures the server starts and allows decoupling the code block analysis and syntax highlighting from Next.js.

  Alternatively, the process can be managed yourself using a library like [concurrently](https://github.com/open-cli-tools/concurrently):

  ```json
  {
    "scripts": {
      "dev": "concurrently \"mdxts watch\" \"next\"",
      "build": "mdxts && next build"
    }
  }
  ```

  ## Collections

  This also introduces a new `createCollection` utility:

  ```ts
  import {
    createCollection,
    type MDXContent,
    type FileSystemSource,
  } from 'mdxts/collections'

  export type PostSchema = {
    default: MDXContent
    frontmatter?: {
      title: string
      description: string
    }
  }

  export type PostSource = FileSystemSource<PostSchema>

  export const PostsCollection = createCollection<PostSchema>(
    '@/posts/**/*.{ts,mdx}',
    {
      title: 'Posts',
      baseDirectory: 'posts',
      basePath: 'posts',
    }
  )
  ```

  Collections will soon replace the `createSource` utility and provide a more performant and flexible way to query file system information and render module exports. They focus primarily on querying source files and providing a way to analyze and render file exports.

- 64eeaf0: Updates license from MIT to AGPL-3.0. This ensures that modifications and improvements to the code remain open source and accessible to the community.

### Patch Changes

- 22a4617: Improves error messages for `CodeBlock` type errors to show exactly where each diagnostic occurs.
- 6095e9d: Loads proper lib declarations for in memory file system when type checking front matter.
- abaa320: Fix pathname generation in case the `baseDirectory` exists multiple times in the `filePath`.

  Previously having a file path like `content/content_1/path/file.mdx` and using `content` as base directory results in an invalid pathname like `content-1path/file`.

  Now we get the correct path name like `/content-1/path/file`.

## 1.5.0

### Minor Changes

- 35b05bd: Adds `css` prop for `CodeInline` to allow merging css styles.
- 9457424: Adds `CopyButton` to be used with custom `CodeBlock` components.
- 801b9c3: Moves `GitProviderLink` to use css through `restyle` instead of inline styles.

### Patch Changes

- 511d768: Normalizes `CopyButton` foreground and background colors.
- 2198401: Updates [restyle](https://www.restyle.dev/) to `1.4.0`.
- bc2ef5e: Doesn't override user-defined pre margin in `CodeBlock`.
- 1236bcc: Fixes keyboard accessibility for `CodeBlock` inline copy button.
- 6a05a2a: Uses activity bar foreground color from theme to color source link and copy button icons in `CodeBlock` component.
- 16e6f26: Adds better contrast for `CodeBlock` inline copy button by adding a stroke based on `theme.panel.border`.

## 1.4.0

### Minor Changes

- 5e3a2b8: Adds a `gitProvider` option to the `mdxts/next` plugin.
- 96a02e4: Removes the `fixImports` prop from `CodeBlock`. This prop fixed imports specifically for situtations like examples that are located in a different project and used relative imports. However, examples should use the library import path instead of relative paths by configuring the `module` field in `tsconfig.json`. More info [here](https://x.com/remcohaszing/status/1794338155963064548).

### Patch Changes

- b47d846: Remove browser default `pre` margin in `CodeBlock` component.
- 7d6cb22: Fixes `getGitFileUrl` erroring when no `gitSource` is set.
- 52de5b1: Fixes theme erroring on missing tokens by adding defaults for every theme token used in `mdxts/components`.

## 1.3.0

### Minor Changes

- d36ef90: Adds a `loadHighlighterLanguage` utility for adding custom languages to `CodeBlock` and `CodeInline`.
- 02b3f80: Adds `RenderedHTML` component for rendering `children` as a highlighted HTML string in a `CodeBlock`:

  ```tsx
  import { CodeBlock, RenderedHTML } from 'mdxts'

  export function Basic() {
    return (
      <div style={{ display: 'grid', gap: '2rem' }}>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <h2>Input</h2>
          <CodeBlock
            language="jsx"
            value="<h1 style={{ fontSize: '6rem' }}>Hello World</h1>"
          />
        </div>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <h2>Output</h2>
          <RenderedHTML includeHtml={false}>
            <h1 style={{ fontSize: '6rem' }}>Hello World</h1>
          </RenderedHTML>
        </div>
      </div>
    )
  }
  ```

## 1.2.0

### Minor Changes

- e5b2b81: Renders `CodeBlock` and `CodeInline` tokens using CSS now through [restyle](https://reactstyle.vercel.app/).

### Patch Changes

- a83ed0e: Normalizes `createSource` import paths to posix for Windows.
- ced3036: Fixes `CodeInline` overflow breaking from adding display flex.
- d8d5e6e: Adds export for `Copyright` component from top-level exports.

## 1.1.0

### Minor Changes

- e38535a: Uses `posix.sep` and normalizes `createSource` glob patterns.
- 301629b: Fixes scrollbars for `CodeInline` components that overflow while also moving inline styles to use [restyle](https://github.com/souporserious/restyle).
- ac9118e: Adds `allowCopy` prop to `CodeInline` for rendering a persistent copy button.
- 3cc2642: Moves `@types` packages from dependencies to dev dependencies to reduce npm install size. These should be included in the project `mdxts` is used in now e.g. `npm install @types/react`.

### Patch Changes

- 1ccb33c: Fixes detection of deeply nested package.json exports.
- 35c4b29: Allows setting the fill color for the `MdxtsLogo` and `MdxtsMark` components.
- 1ff3252: Fixes trimming `CodeBlock` source file comments.
- 770c7f5: Sets foreground color for `Toolbar` icons in `CodeBlock`.

## 1.0.0

### Major Changes

- 05d31e7: MDXTS v1 is released! 🎉 Check out the [announcement post](https://www.mdxts.dev/blog/introducing-mdxts) for more details.

### Patch Changes

- 15ffbfb: Configure plain markdown files in addition to mdx files for loader.
- 76ede2b: Treat `diff` as `plaintext` when attempting to tokenize.
- dfc73a1: Removes code blocks before searching for headings when calculating the data item title to prevent bad heading parsing.

## 0.19.0

### Minor Changes

- 00f6547: Uses a slightly smaller filename font size for the `CodeBlock` toolbar by default.
- 87ee6c4: Adds `Copyright` component to render copyright notices.
- 8558c3f: Adds `GitProviderLink` and `GitProviderLogo` components to render links and graphics for the configured git provider.
- 999446c: Adds MDXTS assets for linking back to the MDXTS site:

  ```jsx
  import { BuiltWithMdxts } from 'mdxts/assets'

  export function Footer() {
    return (
      <footer>
        <BuiltWithMdxts />
      </footer>
    )
  }
  ```

- b7c7f0d: Removes default vertical padding for `CodeInline` component.
- fcb0a03: Now infers `gitSource` and `siteUrl` in `mdxts/next` using [Vercel environment variables](https://vercel.com/docs/projects/environment-variables/system-environment-variables) if available.

### Patch Changes

- 9a9d33a: Fixes using the initial value rather than the possibly transformed value in `CodeBlock`.
- de7bad8: Fixes line numbers highlight styles.
- 759bb79: Fixes interaction when copy button covers code block text by hiding the copy button on the first pointer down until entering the code block area again.
- 2e384bb: Closes symbol popover on pointer down to allow selecting code block text.
- ef4b03a: Fixes unnecessarily rendering token when it is whitespace.
- 308c709: Normalizes `CopyButton` sizes across code components.

## 0.18.0

### Minor Changes

- b796c3f: Removes `LineHighlights` component in favor of simpler CSS approach for highlighting lines.
- cccf278: Renames `CodeBlock` `lineHighlights` prop to `highlightedLines`.

  ### Breaking Changes

  - `CodeBlock` `lineHighlights` prop has been renamed to `highlightedLines`.

- 044d1ca: Renames `CodeBlock` `toolbar` prop to `showToolbar`.

  ### Breaking Changes

  - `CodeBlock` `toolbar` prop has been renamed to `showToolbar`.

- dfa9384: Fixes `CodeBlock` accessibility and markup by swapping `div`s with `span`s and using a `code` element around tokens.
- 564806a: Renames `CodeBlock` `lineNumbers` prop to `showLineNumbers`.

  ### Breaking Changes

  - `CodeBlock` `lineNumbers` prop has been renamed to `showLineNumbers`.

- bd646c4: Adds `focusedLines` and `unfocusedLinesOpacity` props to the `CodeBlock` component to control focusing a set of lines and dimming the other lines. It uses an image mask to dim out the lines which can be controlled using `unfocusedLinesOpacity`:

  ````mdx
  ```tsx focusedLines="3-4"
  const a = 1
  const b = 2
  const result = a + b
  console.log(result) // 3
  ```
  ````

  ```tsx
  <CodeBlock
    value={`const a = 1;\nconst b = 2;\n\nconst add = a + b\nconst subtract = a - b`}
    focusedLines="2, 4"
  />
  ```

### Patch Changes

- a02b1d8: Fixes copy button overlapping `CodeBlock` content by only showing the button when hovering the code block. The button now also sticks to the top right of the code block when scrolling.

## 0.17.0

### Minor Changes

- e493fbd: Refines `paths` returned from `createSource` and `mergeSources`. Based on the glob pattern provided, either a one-dimensional or two-dimensional array of paths will be returned:

  ```ts
  import { createSource, mergeSources } from 'mdxts'

  const allPosts = createSource('posts/*.mdx').paths() // string[]
  const allDocs = createSource('docs/**/*.mdx').paths() // string[][]
  const allPaths = mergeSources(allDocs, allPosts).paths() // string[] | string[][]
  ```

  Likewise the `get` method will be narrowed to only accept a single pathname or an array of pathname segments:

  ```ts
  allPosts.get('building-a-button-component-in-react')
  allDocs.get(['examples', 'authoring'])
  ```

  ### Breaking Changes

  - The `paths` method now returns a one-dimensional array of paths for a single glob pattern and a two-dimensional array of paths for multiple glob patterns.
  - The `get` method now only accepts a single pathname or an array of pathname segments.

  You may need to update your code to accommodate these changes:

  ```diff
  export function generateStaticParams() {
  --  return allPosts.paths().map((pathname) => ({ slug: pathname.at(-1) }))
  ++  return allPosts.paths().map((pathname) => ({ slug: pathname }))
  }
  ```

- 7444586: Now `createSource.get` attempts to prepend the incoming pathname with `basePathname` if defined and no data was found.

### Patch Changes

- 6d338a6: Handles null values and throws an error for undefined values when formatting front matter for type checking.

## 0.16.0

### Minor Changes

- 469b021: Enables type-checking for the `CodeBlock` component. To opt-out of type-checking, use the `allowErrors` prop on the code block:

  ```tsx allowErrors
  const a = 1
  a + b
  ```

  This will disable type-checking for the code block and prevent erroring. To show the errors, usually for educational purposes, use the `showErrors` prop:

  ```tsx allowErrors showErrors
  const a = 1
  a + b
  ```

  ### Breaking Changes

  `CodeBlock` now throws an error if the code block is not valid TypeScript. This is to ensure that all code blocks are type-checked and work as expected.

- bb372a8: Normalizes passing `CodeBlock` and `CodeInline` props to `pre` and `code` elements in the rehype plugin.
- 0f49ee9: Adds `previous` and `next` examples metadata to data source.
- f05b552: Normalizes the internal `getEntrySourceFiles` utility that is responsible for determining what TypeScript data sources are public based on `package.json` exports, index files, and top-level directories.

  To determine what source files should be considered public when dealing with package exports, `createSource` gets two new options used to remap `package.json` exports to their original source files:

  ```ts
  import { createSource } from 'mdxts'

  const allPackages = createSource('../packages/mdxts/src/**/*.{ts,tsx}', {
    sourceDirectory: 'src',
    outputDirectory: 'dist',
  })
  ```

  Using a subset of the `mdxts` `package.json` exports as an example:

  ```json
  {
    "exports": {
      ".": {
        "types": "./dist/src/index.d.ts",
        "import": "./dist/src/index.js",
        "require": "./dist/cjs/index.js"
      },
      "./components": {
        "types": "./dist/src/components/index.d.ts",
        "import": "./dist/src/components/index.js",
        "require": "./dist/cjs/components/index.js"
      }
    }
  }
  ```

  These would be remapped to their original source files, filtering out any paths gathered from the `createSource` pattern not explicitly exported:

  ```json
  [
    "../packages/mdxts/src/index.ts",
    "../packages/mdxts/src/components/index.ts"
  ]
  ```

- 0a4bde2: Moves `CodeBlock:sourcePath` to a public prop and adds `sourcePath` to the code meta in the remark plugin.
- 9cf1577: Cleans up type errors to be more understandable and adds a configuration to highlight errors in the terminal:

  ```ts
  import { createMdxtsPlugin } from 'mdxts'

  const withMdxtsPlugin = createMdxtsPlugin({ highlightErrors: true })

  export default withMdxtsPlugin()
  ```

- 2af35d0: Converts theme to object syntax and moves colors to top-level:

  `theme.colors['panel.border']` -> `theme.panel.border`

- 7726268: Adds a new `sort` option to `createSource`:

  ```tsx
  import { createSource } from 'mdxts'

  const allPosts = createSource<{ frontMatter: { date: Date } }>('**/*.mdx', {
    sort: (a, b) => a.frontMatter.date - b.frontMatter.date,
  })
  ```

- c42eb88: Removes panel border modifications which decreased the alpha channel of the `panel.border` theme color. This should now be modified in a custom theme.
- 2af35d0: Rewrites the `CodeBlock` component to use the latest version of [shiki](https://shiki.style/) as well as allows for better composition using newly exposed `Tokens`, `Toolbar`, `LineNumbers`, and `LineHighlights` components:

  ```tsx
  import { getTheme } from 'mdxts'
  import { CodeBlock, Toolbar, Tokens } from 'mdxts/components'

  function CodeBlockWithToolbar() {
    const theme = getTheme()

    return (
      <CodeBlock source="./counter/Counter.tsx">
        <div
          style={{
            backgroundColor: theme.background,
            color: theme.foreground,
          }}
        >
          <Toolbar allowCopy style={{ padding: '0.5rem 1rem' }} />
          <pre
            style={{
              whiteSpace: 'pre',
              wordWrap: 'break-word',
              overflow: 'auto',
            }}
          >
            <Tokens />
          </pre>
        </div>
      </CodeBlock>
    )
  }
  ```

  Individual `CodeBlock` elements can be styled now for simple overriding:

  ```tsx
  <CodeBlock
    className={{
      container: GeistMono.className,
    }}
    style={{
      container: {
        fontSize: 'var(--font-size-body-2)',
        lineHeight: 'var(--line-height-body-2)',
        padding: '1rem',
      },
      toolbar: {
        padding: '0.5rem 1rem',
      },
    }}
    language="tsx"
    value="..."
  />
  ```

  ### Breaking Changes

  `CodeBlock` now uses a keyed `className` and `style` object to allow for more granular control over the styling of the `CodeBlock` components. To upgrade, move the `className` and `style` definitions to target the `container`:

  ```diff
  <CodeBlock
  --  className={GeistMono.className}
  ++  className={{ container: GeistMono.className }}
  style={{
  ++    container: {
             padding: '1rem'
  ++    },
    }}
  ```

- 0b80bf5: Adds a `fixImports` prop to `CodeBlock` to allow fixing imports when the source code references files outside the project and can't resolve correctly:

  ```tsx
  import { CodeBlock } from 'mdxts/components'

  const source = `
  import { Button } from './Button'
  
  export function BasicUsage() {
    return <Button>Click Me</Button>
  }
  `

  export default function Page() {
    return <CodeBlock fixImports value={source} />
  }
  ```

  An example of this is when rendering a source file that imports a module from a package that is not in the immediate project. The `fixImports` prop will attempt to fix these broken imports using installed packages if a match is found:

  ```diff
  --import { Button } from './Button'
  ++import { Button } from 'design-system'

  export function BasicUsage() {
    return <Button>Click Me</Button>
  }
  ```

- 2af35d0: Rewrites relative import specifiers pointing outside of the project to use the package name if possible:

  `import { getTheme } from '../../mdxts/src/components'` -> `import { getTheme } from 'mdxts/components'`

- 0e2cc45: Adds a `renumberFilenames` option to the next plugin for configuring whether or not to renumber filenames when adding/removing/modifying ordered content.
- ad8b17f: ### Breaking Changes

  The `CodeBlock` `highlight` prop has been renamed to `lineHighlights` to better match the `LineHighlights` component nomenclature.

- 7c5df2f: Fixes data source ordering to use strings instead of `parseInt` to ensure that the items are always ordered correctly.

  ### Breaking Changes

  The `order` property for a data source item is now a padded string instead of a number.

### Patch Changes

- 8802a57: Fixes hardcoded CSS properties in `Toolbar` copy button by using `em` values and `currentColor`.
- 91e87c4: Renames `getTheme` utility to `getThemeColors`.
- 85722e3: Fixes MDX code block meta values with an equals sign from being parsed incorrectly.
- f21cf8d: Allows omitting `CodeBlock` filename extension and uses `language` if provided.
- 2af35d0: Fixes splitting tokens when multiple symbols exist in a single token.
- 58b9bd3: Fixes source links to direct line and column in GitHub.
- 885a6cc: Fixes polluting `CodeBlock` globals by always adding a `export { }` declaration to the AST and only removing it from the rendered tokens.
- c57b51f: Speeds up build by lazily executing dynamic imports.

## 0.15.3

### Patch Changes

- 31c1dbc: Handle monorepos when checking if git repository in `getGitMetadata`.

## 0.15.2

### Patch Changes

- d3520da: Prevent fatal git error in console by checking for `.git` directory in `getGitMetadata`.

## 0.15.1

### Patch Changes

- bf65891: Fixes inferred front matter for `createSource.get` method.
- 94fd7fe: Silence `jju` warnings used by `@manypkg/find-root`.
- a79d453: Handles nested fields when type checking front matter.
- 635de6c: Bail early if not a git repository to avoid printing git errors when not initialized yet.

## 0.15.0

### Minor Changes

- 435c5e8: Allow overriding `frontMatter` type through `createSource` generic.

  ```ts
  import { createSource } from 'mdxts'

  export const allDocs = createSource<{
    frontMatter: {
      title: string
      description: string
      date: string
      tags?: string[]
    }
  }>('docs/*.mdx')
  ```

- fac626b: Adds front matter type validation using the generic passed to `createSource`:

  ```ts
  import { createSource } from 'mdxts'

  export const allPosts = createSource<{
    frontMatter: {
      title: string
      date: Date
      summary: string
      tags?: string[]
    }
  }>('posts/**/*.mdx', { baseDirectory: 'posts' })
  ```

  ```posts/markdown-guide.mdx
  ---
  title: Hello World
  date: 2021-01-01
  ---

  # Hello World

  This is a post.
  ```

  Results in the following type error:

  ```
  Error: Front matter data is incorrect or missing
  [/posts/markdown-guide.mdx] Type '{}' does not satisfy the expected type 'frontMatter'.
  Type '{}' is missing the following properties from type 'frontMatter': summary
  ```

### Patch Changes

- 7327000: Fixes WebSocket error during local development when first loading the page:

  ```
  InvalidStateError: Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.
  ```

## 0.14.0

### Minor Changes

- 32c9686: Removes private `Editor` and `Preview` components and related dependencies to reduce bundle size.
- 6fcd390: Adds initial support for Next.js [Turbopack](https://nextjs.org/docs/app/api-reference/next-config-js/turbo) locally.

### Patch Changes

- 9feac19: Removes processing MDX files with Webpack loader since it is now handled through remark and `getAllData`.

## 0.13.0

### Minor Changes

- 88b9e10: Simplify `MDXContent` to not include plugins by default and instead expose new `remarkPlugins`, `rehypePlugins`, and `baseUrl` props.
- ad09ddb: Moves `frontMatter` from Webpack loader to static `getAllData` utility so front matter metadata is available when using the `createSource.all` method.
- b42a275: Removes `ShouldRenderTitle` transformation from Webpack loader and now adds it through a remark plugin.

### Patch Changes

- e76e18e: Fixes headings getting incremented ids when duplicates do not exist.

## 0.12.1

### Patch Changes

- f35df99: Fixes the `getGitMetadata` utility erroring when running MDXTS in a project that does not have git instantiated.
- fa4d329: Fixes the Webpack loader not updating dynamic imports when the `createSource` file pattern directory changes.
- d651cd0: Filter empty lines from git log to avoid `getGitMetadata` erroring related to #81.
- d3fc5ac: Throw more helpful error if MDX code block is empty.

## 0.12.0

### Minor Changes

- a7bae02: Reformat `createSource.all` method to return an array instead of an object.

  ```diff
  const allDocs = createSource('docs/*.mdx')
  ---Object.values(allDocs.all()).map((doc) => ...)
  +++allDocs.all().map((doc) => ...)
  ```

- 7942259: Move source item `gitMetadata` to top-level fields.

  ```diff
  import { MetadataRoute } from 'next'
  import { allData } from 'data'

  export default function sitemap(): MetadataRoute.Sitemap {
    return Object.values(allData.all()).map((data) => ({
      url: `https://mdxts.dev/${data.pathname}`,
  ---    lastModified: data.gitMetadata.updatedAt,
  +++    lastModified: data.updatedAt,
    }))
  }
  ```

- 305d1a4: Throw error if attempting to use git metadata and repo is shallowly cloned.
- ba37a05: Adds `url` field to source item that concatenates `siteUrl` with `pathname`.
- e487e1f: Adds a remark plugin to transform relative ordered links:

  ```diff
  --- [./02.rendering.mdx]
  +++ [./rendering]
  ```

### Patch Changes

- fc74fb9: Fixes `CodeBlock` `allowCopy` prop still showing copy button when set to `false`.
- b7da458: Fixes code blocks being transformed when wrapping headings in `ShouldRenderTitle`.

## 0.11.0

### Minor Changes

- 90863ba: Adds RSS feed helper for `createSource` and `mergeSources`:

  ```js
  // app/rss.xml/route.js
  import { allData } from 'data'

  export async function GET() {
    const feed = allData.rss({
      title: 'MDXTS - The Content & Documentation SDK for React',
      description: 'Type-safe content and documentation.',
      copyright: `©${new Date().getFullYear()} @souporserious`,
    })
    return new Response(feed, {
      headers: {
        'Content-Type': 'application/rss+xml',
      },
    })
  }
  ```

- 4121eb9: Replaces `remark-typography` with the more popular `remark-smartypants` package.
- 7367b1d: Adds ISO 8601 duration to `readingTime` metadata for easier use with `time` HTML element.
- e04f4f6: Adds `createdAt`, `updatedAt`, and `authors` fields to `createSource` item. This implementation is inspired by [unified-infer-git-meta](https://github.com/unifiedjs/unified-infer-git-meta).
- 9c6d65a: Adds `readingTime` field to `createSource` item using [rehype-infer-reading-time-meta](https://github.com/rehypejs/rehype-infer-reading-time-meta).
- fb0299d: Adds support for Codesandbox embeds in MDX.

### Patch Changes

- 6e68e11: Fixes an issue where saving content did not trigger a fast refresh locally. This adds a web socket server component to the Content component to ensure a refresh is always triggered.
- fafdcc6: Adds default `feedLinks.rss` option when creating rss feeds.
- df41a98: Fixes empty `createSource` when targeting JavaScript/TypeScript without an `index` file.

## 0.10.1

### Patch Changes

- d16f84d: Reverts 06e5c20 which merged default `MDXComponents` into `MDXContent` components as it causes an infinite loop.

## 0.10.0

### Minor Changes

- 2b60fa0: Add same `remark` and `rehype` plugins used in `mdxts/next` to `MDXContent` component.
- 06e5c20: Merge default `MDXComponents` into `MDXContent` components.
- 2bf8b02: Allow passing a language to inline code in MDX like `js const a = '1'`.

### Patch Changes

- ae3d6a3: Fix metadata analysis to account for MDX syntax.
- 1b2b057: Fix example names not being parsed as a title.
- 4b9314c: Fix missing theme for `MDXContent` in examples.

## 0.9.1

### Patch Changes

- 29a923d: Fixes heading level one not being rendered as markdown.
- 16eabd2: Fix remark plugins not being initialized correctly.
- 05106f3: Merge data title into metadata if not explicitly defined.

## 0.9.0

### Minor Changes

- 16031d0: Adds a `renderTitle` prop to the `Content` component returned from `createSource` to allow overriding the default title for an MDX file.
- 5707439: Add `className` and `style` to `CopyButton`.
- c673a16: Add `fontSize` and `lineHeight` props to `CodeBlock`.
- 849dd1c: Replace `isServerOnly` field with `executionEnvironment` that can be either `server`, `client`, or `isomorphic`.
- 87026e9: Only use inferred description from MDX for metadata.
- 78fbfbb: Add separate `PackageStylesAndScript` component for `PackageInstallClient` styles and local storage hydration.
- 758ab24: Sync package manager state across other component instances and windows.

### Patch Changes

- c753d53: Fix headings below level one getting wrapped with `ShouldRenderTitle`.
- ddf8870: Add `name` support for type aliases, interfaces, and enum declarations.
- 000acf3: Fix default `Symbol` highlight color to be a transparent version of the theme `hoverHighlightBackground`.
- 71f5545: Fix `isMainExport` field for `exportedTypes` to correctly interpret which export declaration is the main export based on a matching name.
- 65824b9: Fix JavaScript code blocks erroring with `cannot read undefined reading flags, escapedName` by setting ts-morph project config to `allowJs`.

## 0.8.2

### Patch Changes

- 5fd018d: Use better theme variables that work across various themes for `CodeBlock` component.
- 50e47bc: Fix `@internal` JSDoc tag analysis for variable declarations.
- 23e6ab9: Add `workingDirectory` prop through loader if `CodeBlock`, `CodeInline`, or `ExportedTypes` are imported.
- 8efe0e0: Clean up `ExportedTypes` declaration type default value.
- 4a5aa29: Add theme container styles to `CodeInline`.

## 0.8.1

### Patch Changes

- 57f1e39: Fix `QuickInfo` font-family and foreground color styles.
- d34d877: Fix multline jsx only code blocks.
- a761181: Fix devtools server action from erroring when using static export.
- c261e18: Allow default MDX components to be overridden at the component level.
- 3a86f90: Move theme configuration to the end of the source in the webpack loader to avoid overwriting `use client` directives.
- 1963ce6: Fix incorrect jsx-only code block token start/end positions.

## 0.8.0

### Minor Changes

- 69e8dc8: Don't remove level one heading from content.

### Patch Changes

- 9379847: Gracefully handle undefined `gitSource` option.

## 0.7.0

### Minor Changes

- 19d82bd: Move `gitSource` url codemod to the CLI and add support for other git providers.

### Patch Changes

- ba56adc: Add try/catch around CodeBlock `createSourceFile` as temporary fix when virtual files cannot be created.
- 2b1628c: Fixes load order for MDX components to load before the `@mdx-js/react` package.`

## 0.6.2

### Patch Changes

- 71f9cc2: Remove `@typescript/ata` since it isn't currently being used and causes package version issues with newer TypeScript versions.
- 9a0ed54: Move `prettier` and `shiki` to peer dependencies.

## 0.6.1

### Patch Changes

- 577d4b7: Remove public files in `mdxts/next` for now. These are generated for syntax highlighting and type checking on the client for the unreleased `Editor` component.

## 0.6.0

### Minor Changes

- dfea828: Use stable generated filename based on Code value.
- 47c8ee1: Replaces `summary` export from remark plugin with `description` which is now used to calculate data `description` field.
- b2d9324: Account for standard `@internal` JSDoc tag instead of `@private` in `getExportedSourceFiles`.
- d7ac97a: Pass processed entry declarations to determine implicit internal exports in `getAllData`.
- e89116e: Reduces the number of times the shiki highlighter is initialized to prevent `memory access out of bounds` errors.
- 4303ce5: Add support for `examples` directory.
- 3fff302: Add default MDX components to `next` plugin for `code` and `pre` elements.
- f66aaa2: Adds `ExportedTypes` component for gathering types from a file or source code.
- 3a6fe9b: Add support for following index file exports when gathering exported types.
- 8671ff8: Add global timer to `QuickInfo` for better hover interactions.
- 66edade: Add support for ordered `Code` blocks using a numbered filename prefix.
- 57d8a29: Rename `MDX` to `MDXContent` and `mdxComponents` to `MDXComponents`.
- f66aaa2: Use smaller generated `filename` for `CodeBlock`. Using `Buffer.from(props.value).toString('base64')` was causing an `ENAMETOOLONG` error.
- e5fe316: Fixes `QuickInfo` tooltip by keeping it in view and accounting for scroll offset.
- 97c0861: Introduces preconfigured examples starting with a blog example.
- 3109b2d: Remove `PackageExports` component, this information is accessible from the data returned in `createSource`.
- b948305: Split up `Code` component into `CodeBlock` and `CodeInline` components.
- cc3b831: Add `style` prop to `PackageInstall`.
- 5c0c635: Account for `@internal` JSDoc tag in `getExportedTypes`.
- 8c13479: Always split highlighter tokens by identifier.

### Patch Changes

- 1f3875d: Fix `Symbol` highlighted state when hovering `QuickInfo`.
- 3dd1cf3: Fix `QuickInfo` paragraph color.
- 0465092: Fix relative `createSource` paths by using absolute paths for imports and adding webpack file dependencies.
- 204bba5: Use cross-platform file path separator in `Code`.
- 1f45a78: Fix `QuickInfo` erroring when parsing documentation by handling links properly.
- a272add: Fix `CodeBlock` filename label when complex filename. The regex was only accounting for strings that begin with numbers.
- daf9550: Handle all exported declarations in `getExportedTypes`.
- eac632c: Add text-wrap pretty to `QuickInfo` paragraphs.
- f9d8e48: Compute `Module` type so quick info is cleaner.
- 1fd91d3: Fix metadata erroring when front matter is available.

## 0.5.0

### Minor Changes

- f8b71d6: Implement specific allowed errors.
- 2f1cdbe: Add `toolbar` prop to `Code` for controlling rendering of toolbar.
- 63939ac: Improve `Navigation` `renderItem` prop types.
- 20182d4: Default to common root for now when no exports field found.
- 0d91905: Add `style` prop to `Code`.
- 515d727: Add diagnostic error code in `QuickInfo` tooltip.
- bfc8b40: Add plaintext language option to highlighter.
- b501e32: Add example source text to examples metadata.
- 86c32e3: Rename `getMetadataFromClassName` -> `getClassNameMetadata`.
- ad4fd02: Use package json path when calculating entry source files.
- 61e72cd: Add `MDX` component for rendering mdx source code.
- d77a29a: Use box shadow instead of border in `Code` to prevent adding to layout.
- 606c25d: Render quick info documentation text as MDX.
- 50dc93d: Only require working directory in `Code` when using relative paths.
- 79e7e5d: Fix file path to pathname slugs for all caps e.g. `MDX.tsx` -> `mdx`
  and `MDXProvider.tsx` -> `mdx-provider`.
- ffd4512: Add exhaustive type documentation generation accounting for template literal and call expressions.

### Patch Changes

- cf73027: Fix navigation order by filtering out private files.
- 5f30ed1: Collapse `Code` toolbar grid row when not used.
- a4cc4c3: Fixes code blocks being treated as global scope when no imports or exports are present.
- 2876946: Improve quick info tooltip type wrapping instead of overflowing.
- e392e3c: Infer `Code` language from filename if provided.
- 42eea84: Fix parsing directory base name to title.

## 0.4.1

### Patch Changes

- 6c64d70: Throw error when no files found for `createSource` file pattern.

## 0.4.0

### Minor Changes

- 913fc68: Add Node polyfill plugin for Editor.
- e3ed63f: Rename `createDataSource` -> `createSource` and `mergeDataSources` -> `mergeSources`
- 4bbb048: Add `allowCopy` `Code` prop for controlling the rendering of the copy button.
- cb95470: Add cli tool to scaffold initial project.

### Patch Changes

- 576b808: Fix loading shiki themes.

## 0.3.0

### Minor Changes

- 7b3a555: Fix data source item order not taking directory into account.
- 329ed73: Add `depth` property to data item.
- 3fb551f: Fix <Code inline /> hydration issue by rendering spans instead of divs.
- 3e7e3a4: Use a root relative pathname as the data key.
- 445c961: Link to the first immediate page with data in `tree` utility.
- 038ac17: Add `mergeDataSources` function to merge multiple sources returned from `createDataSource`.
- c17d469: Fix previous/next sort order.
- df9c8ee: Adds a `getExample` helper attached to the data source.
- 10d66a4: Add support for examples extension.
- 3d4105a: Add pathname and slug to example items.
- e4a68eb: Pass `workingDirectory` to Code component used in examples.

### Patch Changes

- 6fe9356: Fix type table of contents slug.
- e15d50e: Expand type documentation if it is not publicly linkable.
- 53cbf75: Fix `createDataSource` loader transform not working when other imports are present.
- 500d3ca: Remove leading numbers from title generated from filename.
- 66b8629: Fix camel case filename to pathname conversion.

## 0.2.0

### Minor Changes

- 070c2f2: Partial rewrite to remove the `bundle` package in favor of the framework's bundler.

### Patch Changes

- 353140d: Add Editor based on starry-night highlighter.
- cc81cfb: Add remark-typography plugin.
- 27366fd: Replace starry-night with shiki.
- d435839: Adds initial format handling using dprint-node on the server and prettier on the client. The different formatters is required until prettier works with Server Components.

## 0.1.5

### Patch Changes

- 27fa51d: Use config theme for shiki highlighting.
- e4ba8ba: Initial Editor component.
- 3d536d7: Transform code when JavaScript or TypeScript code block.
- 33f93b9: Fix multiple watchers being created.
- a63b352: Better error message for meta props transform.
- f0ca3b7: Load theme through next config.
- 0a5de46: Fix meta props.

## 0.1.4

### Patch Changes

- 4ee1325: Map meta string to props.

## 0.1.3

### Patch Changes

- ac2703b: Initial Example component implementation.
- 6aeba9c: Fix symbolic links transform cutting off content.
- 32ac2bb: Change `getExamplesFromDirectory` signature to accept a directory.
- e86ce2b: Remove @mdx-js/react and ts-morph peer dependencies.

## 0.1.2

### Patch Changes

- ae87fdc: Fix bundling JavaScript/TypeScript files.
- ae87fdc: Render index pages.
- a5ef955: Add data from source files automatically and make loader optional.
- ae87fdc: Pass `Project` to loader.
- 714df88: Ignore build files in watcher.

## 0.1.1

### Patch Changes

- a37c08e: Fix types

## 0.1.0

### Minor Changes

- 56fca96: Initial release
