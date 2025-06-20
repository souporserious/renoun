---
'renoun': major
---

Updates the `Directory` constructor `sort` option to now accept a string and optionally a sort descriptor using a new `createSort` utility. This now ensures sorting is performant by calculating keys upfront and then comparing them. Additionally, a string can now be passed for simpler cases.

### Breaking Changes

The `Directory` constructor `sort` option now requires `createSort`, previously sorting was defined in one function:

```tsx
import { Directory } from 'renoun/file-system'

const directory = new Directory<{ mdx: { frontmatter: { date: Date } } }>({
  include: '*.mdx',
  sort: async (a, b) => {
    const aFrontmatter = await a.getExportValue('frontmatter')
    const bFrontmatter = await b.getExportValue('frontmatter')

    return bFrontmatter.date.getTime() - aFrontmatter.date.getTime()
  },
})
```

Now this should be split into a sort `key` resolver and the `compare` function:

```tsx
import { Directory, createSort } from 'renoun/file-system'

const directory = new Directory<{ mdx: { frontmatter: { date: Date } } }>({
  include: '*.mdx',
  sort: createSort({
    key: (entry) => {
      return entry
        .getExportValue('frontmatter')
        .then((frontmatter) => frontmatter.date)
    },
    compare: (a, b) => a - b,
  }),
})
```

For common use cases, this can be further simplified now by defining a valid sort key directly:

```tsx
import { Directory, createSort } from 'renoun/file-system'

const directory = new Directory<{ mdx: { frontmatter: { date: Date } } }>({
  include: '*.mdx',
  sort: 'frontmatter.date',
})
```

Note, the value being sorted is taken into consideration. Dates will be sorted descending, while other values will default to ascending. If you need further control, but do not want to fully customize using `createSort`, a `direction` can be provided as well:

```tsx
import { Directory, createSort } from 'renoun/file-system'

const directory = new Directory<{ mdx: { frontmatter: { date: Date } } }>({
  include: '*.mdx',
  sort: {
    key: 'frontmatter.date',
    direction: 'acscending',
  },
})
```
