# @renoun/mdx

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
