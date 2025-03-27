---
'renoun': minor
'@renoun/mdx': minor
---

Updates exported `headings` variable from the `addHeadings` remark plugin to include a new `children` property to allow rendering the JSX children of the heading element. This allows for more complex headings to be rendered with the `addHeadings` plugin. For example, headings with inline code or links.

### Breaking Changes

The `depth` property of the heading metadata object was renamed to `level` to better reflect HTML nomenclature.
