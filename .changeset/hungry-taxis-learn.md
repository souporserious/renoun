---
'renoun': patch
---

Fixes `<Directory>.getFile` not considering file name modifiers.

```ts
const directory = new Directory({ path: 'components' })
const file = await directory.getFileOrThrow(['APIReference', 'examples'])

file.getAbsolutePath() // '/APIReference.examples.tsx'
```
