---
'renoun': minor
---

Adds `isFileWithExtension` utility:

```ts
const fileSystem = new VirtualFileSystem({
  'Button.tsx': '',
})
const directory = new Directory<{ tsx: { metadata: {} } }>({
  fileSystem,
})
const file = await directory.getFileOrThrow('Button')

if (isFileWithExtension(file, 'tsx')) {
  // file is typed as File<{ tsx: { metadata: {} } }>
}
```
