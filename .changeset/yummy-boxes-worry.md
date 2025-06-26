---
'renoun': major
---

Updates the `Directory` constructor `sort` option to now accept either a string or a sort descriptor using a new `createSort` utility. This new API makes it easier to sort entries while ensuring sorting stays performant by calculating asynchronous keys upfront and then comparing them synchronously.

This also fixes a bug when using `Directory#getEntries({ recursive: true })` where the results were not being sorted at each depth.

### Breaking Changes

The `Directory` constructor `sort` option now requires either a string or a sort descriptor using the new `createSort` utility.

Previously, sorting was defined in one function:

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

Now, a sort descriptor requires defining a `key` resolver and `compare` function:

```tsx
import { Directory, createSort } from 'renoun/file-system'

const directory = new Directory<{ mdx: { frontmatter: { date: Date } } }>({
  include: '*.mdx',
  sort: createSort(
    (entry) => {
      return entry
        .getExportValue('frontmatter')
        .then((frontmatter) => frontmatter.date)
    },
    (a, b) => a - b
  ),
})
```

For common use cases, this can be further simplified by defining a valid sort key directly:

```tsx
import { Directory } from 'renoun/file-system'

const directory = new Directory<{ mdx: { frontmatter: { date: Date } } }>({
  include: '*.mdx',
  sort: 'frontmatter.date',
})
```

Note, the value being sorted is taken into consideration. Dates will be sorted descending, while other values will default to ascending. If you need further control, but do not want to fully customize the sort descriptor using `createSort`, a `direction` can be provided as well:

```tsx
import { Directory } from 'renoun/file-system'

const directory = new Directory<{ mdx: { frontmatter: { date: Date } } }>({
  include: '*.mdx',
  sort: {
    key: 'frontmatter.date',
    direction: 'ascending',
  },
})
```
