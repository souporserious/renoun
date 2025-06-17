---
'renoun': minor
---

Adds `getExportValue` method to `Directory` that will attempt to load the requested export from either the `index` or `readme` paths. This makes it simpler to use with entries that also include `JavaScriptFile` and `MDXFile`.

```tsx
await new Directory<{ mdx: { metadata: { title: string } } }>({ path: 'docs' })
  .getEntries({ recursive: true })
  .then((entries) =>
    Promise.all(
      entries.map(async (doc) => {
        const { title } = await doc.getExportValue('metadata')
        // ...
      })
    )
  )
```
