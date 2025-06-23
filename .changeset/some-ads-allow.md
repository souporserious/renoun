---
'renoun': minor
---

Adds a `resolveFileFromEntry` file system utility that will attempt to load the entry from either the `index` or `readme` when the entry is a directory. This makes it simpler to parse exports from entries since they include files and directories.

```tsx
await new Directory<{ mdx: { metadata: { title: string } } }>({ path: 'docs' })
  .getEntries({ recursive: true })
  .then((entries) =>
    Promise.all(
      entries.map(async (doc) => {
        const file = await resolveFileFromEntry(doc, 'mdx')
        const { title } = await file.getExportValue('metadata')
        // ...
      })
    )
  )
```
