# @renoun/mdx

## 3.8.0

### Minor Changes

- 82721e2: Allows overriding a `Section` component (default `Fragment`) when rendering headings so consumers can wrap sections with custom elements or providers.

## 3.7.1

### Patch Changes

- fd2236d: Update license current year.

## 3.7.0

### Minor Changes

- a10dc65: Adds a remark `transform-jsdoc-inline-tags` plugin for transforming JSDoc inline tags like `{@link}`, `{@code}`, and related inline tags into links or inline code.
- cd7e2ba: Adds `healMarkdown` utility to help complete missing markdown when streaming.

### Patch Changes

- d1f54d4: Adds export for `@renoun/mdx/remark/gfm` plugin. This makes it easier to access in bundlers that require serialized options.

## 3.6.1

### Patch Changes

- ba4a8c0: Adds a focused `typography` remark plugin that replaces the `remark-smartypants` dependency.
- dc0075a: Update dependencies.
- fd580a0: Adds a focused `unwrap-images` rehype plugin that replaces the `rehype-unwrap-images` dependency.

## 3.6.0

### Minor Changes

- d473caf: Updates the `CodeBlock` component and MDX utilities so code fences are handled consistently in the `Markdown` and `MDX` components.
  - `CodeBlock` now accepts raw `pre` element props directly and internally infers the `language`, `path`, and `children` from the nested `code` element.
  - The `parsePreProps` helper has been removed from the public API. Any previous `pre: (props) => <CodeBlock {...parsePreProps(props)} />` mappings should switch to `pre: (props) => <CodeBlock {...props} />` or just provide `CodeBlock` when using the `@renoun/mdx/rehype/add-code-block` plugin.
  - The `@renoun/mdx` rehype `add-code-block` plugin now also replaces markdown code fences with a `CodeBlock` element, so `CodeBlock` and its meta props work the same way across Markdown and MDX pipelines.

## 3.5.0

### Minor Changes

- c415977: Extends generated `heading` export metadata to include a `summary` field in the `@renoun/mdx/remark/add-headings` plugin.
- 2f4ba21: Adds a new `@renoun/mdx/remark/add-front-matter` plugin that will trim the frontmatter and export it from the file. This also exposes a `getFrontmatter` method for `MarkdownFile` and `MDXFile` utilities.

### Patch Changes

- 87c0a98: Guards object merges against prototype pollution in the MDX and core packages by skipping dangerous keys when spreading user-authored data.

## 3.4.1

### Patch Changes

- b2a14cb: Fixes `Heading` override in MDX provider not being applied when using the `@renoun/mdx/remark/add-headings` plugin.
- f1dfed0: Preserves `boolean`/`number` props in the rehype `add-code-block` plugin by emitting MDX attribute value expressions instead of stringifying.

## 3.4.0

### Minor Changes

- afcfb23: Adds an anchor to all headings now by default and additionally adds a `Heading` component from the `@renoun/mdx/remark/add-headings` plugin so MDX consumers can override all headings at once:

  ```tsx path="examples/docs/mdx-components.tsx"
  import type { MDXComponents } from 'renoun'

  export function useMDXComponents() {
    return {
      Heading: ({ Tag, id, children, ...rest }) => {
        return (
          <Tag id={id} {...rest}>
            <a href={`#${id}`}>{children}</a>
          </Tag>
        )
      },
    } satisfies MDXComponents
  }
  ```

  ### Breaking Changes

  Now that headings contain links by default when using `@renoun/mdx/remark/add-headings` this will require additional styling considerations for headings since they will now inherit anchor styles.

## 3.3.0

### Minor Changes

- 543774c: Adds a `validate` CLI command and exposes MDX link utilities for validating links in MDX content as well as links for a live site.

## 3.2.1

### Patch Changes

- e23c119: Replaces the `rehype-infer-reading-time-meta` dependency with a built-in utility for calculating the reading time.

## 3.2.0

### Minor Changes

- 5ff7c78: Adds `getMarkdownHeadings` and `getMDXHeadings` utilities to extract headings from markdown and MDX content respectively.
- cfcaaed: Renames `MDXHeadings` type to `Headings` to better reflect that it's not exclusively tied to MDX.
- f822446: Consolidates Markdown/MDX utilities and dependencies into `@renoun/mdx` and updates `renoun` to use them.

## 3.1.1

### Patch Changes

- e664e81: Fixes hydration errors caused when rendering headings that include links. These are now unwrapped since the link will be created for the section specifically when rendered.

## 3.1.0

### Minor Changes

- ea9cccc: Allows MDX files to override the exported `headings` variable by exporting a `getHeadings` function.

  ```hello-world.mdx
  export function getHeadings(headings) {
    return [
      ...headings,
      { id: 'extra', level: 2, text: 'Extra', children: 'Extra' },
    ]
  }

  # Hello World
  ```

  This will now include the extra headings when importing them from the file:

  ```tsx allowErrors
  import Content, { headings } from 'hello-world.mdx'
  ```

  This feature is disabled by default for security purposes, please import and configure this plugin to enable:

  ```tsx
  import { remarkAddHeadings } from '@renoun/mdx/add-headings'
  import { evaluate } from '@mdx-js/mdx'

  const result = await evaluate('# Hello World', {
    remarkPlugins: [[addHeadings, { allowGetHeadings: true }]],
  })
  ```

## 3.0.0

### Major Changes

- 7e38b82: Updates `create-renoun` and `@renoun/mdx` licensing to use `MIT` license.

### Minor Changes

- d3c6019: Updates how to use the `CodeBlock` component in MDX. When using `renoun/mdx`, a new `addCodeBlock` rehype plugin rewrites the `pre` element to a `CodeBlock` element. This is more explicit and requires defining a `CodeBlock` component now.

  ### Breaking Changes

  If you are using the `renoun/mdx` plugins, wherever you pass additional MDX components needs to be updated to provide a `CodeBlock` component now:

  ```diff
  import {
      CodeBlock,
  --    parsePreProps
  } from 'renoun/components'

  function useMDXComponents() {
    return {
  --    pre: (props) => <CodeBlock {...parsePreProps(props)} />,
  ++    CodeBlock,
    }
  }
  ```

  If you are not using `renoun/mdx` plugins `parsePreProps` is still required.

- d537e64: Adds a `Markdown` component. This should be used when rendering markdown content and is now used to render JS Doc quick info content in the `CodeBlock` component to ensure that the intended markdown is rendered correctly. This is also safer since we do not need to evaluate anything and return JSX elements directly.

## 2.1.0

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

## 2.0.0

### Major Changes

- b33e5ca: This simplifies the `renoun/mdx` package by removing unnecessary plugins.

  ### Breaking Changes

  The `remark-frontmatter`, `remark-mdx-frontmatter`, `remark-squeeze-paragraphs`, and `remark-strip-badges` plugins were removed from the `renoun/mdx` package. To add the same functionality as before, you will need to install and import them manually:

  ```bash
  npm install remark-frontmatter remark-mdx-frontmatter remark-squeeze-paragraphs remark-strip-badges
  ```

  ```js
  import remarkFrontmatter from 'remark-frontmatter'
  import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
  import remarkSqueezeParagraphs from 'remark-squeeze-paragraphs'
  import remarkStripBadges from 'remark-strip-badges'

  export default {
    remarkPlugins: [
      remarkFrontmatter,
      remarkMdxFrontmatter,
      remarkSqueezeParagraphs,
      remarkStripBadges,
    ],
  }
  ```

  A more simplified approach can be used for frontmatter by exporting a `frontmatter` or `metadata` object from the MDX file directly:

  ```tsx
  export const frontmatter = {
    title: 'Hello World',
    date: '2025-03-24',
  }
  ```

### Minor Changes

- d7d15f7: Adds exports for all `remark` and `rehype` plugins. Plugins can now be imported as grouped plugins:

  ```tsx
  import remarkRenoun from '@renoun/mdx/remark'
  import rehypeRenoun from '@renoun/mdx/rehype'
  ```

  Or as individual plugins:

  ```tsx
  import rehypeAddReadingTime from '@renoun/mdx/rehype/add-reading-time'
  import remarkAddHeadings from '@renoun/mdx/remark/add-headings'
  ```

- 6d6684f: Cleans up manually constructing export AST by using `unist-util-mdx-define`.

## 1.6.0

### Minor Changes

- 3dac737: Removes parsing of `filename`, `language`, and `value` props for pre elements since these can be parsed directly in the `parsePreProps` utility.
- e67e284: Moves inline code `language` parsing to `parseCodeProps` utility.

## 1.5.0

### Minor Changes

- a5c470c: Replaces `shiki` languages with a locally-defined set of languages.

## 1.4.1

### Patch Changes

- b325412: Imports correct MDX AST global types.

## 1.4.0

### Minor Changes

- 5f524f5: Updates all dependencies to their latest version.

## 1.3.2

### Patch Changes

- ae38994: Update `shiki` dependency to latest version.

## 1.3.1

### Patch Changes

- c394b9c: Moves `shiki` to dynamic import to avoid ESM require errors.

## 1.3.0

### Minor Changes

- 97bc268: Renames `@renoun/mdx` `Headings` type to `MDXHeadings`. This adds better clarity and consistency with the other `MDX` prefixed types.

  ### Breaking Changes
  - Rename any `Headings` references from `@renoun/mdx` to `MDXHeadings`.

### Patch Changes

- ece3cc2: Fixes inline code language inference by considering language aliases.
- df4d29d: Removes `mdast` dependency. This was added by mistake and is not needed since `@types/mdast` is already a dependency.

## 1.2.1

### Patch Changes

- 7020585: Updates all dependencies to latest version.

## 1.2.0

### Minor Changes

- 72a2e98: Fixes specifying a `language` for inline MDX code.

## 1.1.0

### Minor Changes

- 1c4c390: Moves `MDXContent` and `MDXComponents` type exports to `@renoun/mdx` package.
- b9d52a3: More descriptive name for remark paragraphs plugin, `removeParagraphs` -> `removeImmediateParagraphs`.

## 1.0.1

### Patch Changes

- ca8b35d: Enables old school dashes through SmartyPants remark plugin.

## 1.0.0

### Major Changes

- 3565fa9: Adds `@renoun/mdx` package that includes pre-configured and custom `remark` and `rehype` plugins.
