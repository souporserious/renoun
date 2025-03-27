---
'renoun': minor
'@renoun/mdx': minor
---

Updates exported `headings` variable from the `addHeadings` remark plugin to include a new `children` property to allow rendering the JSX children of the heading element.

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
