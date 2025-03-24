---
'@renoun/mdx': major
---

This simplifies the `renoun/mdx` package by removing unnecessary plugins.

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

A more simplified approach can be used for front matter by exporting a `frontmatter` or `metadata` object from the MDX file directly:

```tsx
export const frontmatter = {
  title: 'Hello World',
  date: '2025-03-24',
}
```
