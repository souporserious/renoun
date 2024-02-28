# mdxts

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
