---
'renoun': minor
---

Adds javascript file export metadata to `renoun/file-system`:

```tsx
import { VirtualFileSystem, Directory } from 'renoun/file-system'

const fileSystem = new VirtualFileSystem({
  'index.ts': `/**\n * Say hello.\n * @category greetings\n */\nexport default function hello() {}`,
})
const directory = new Directory({ fileSystem })
const file = await directory.getFileOrThrow('index', 'ts')
const fileExport = file.getExport('default')

await fileExport.getName() // 'hello'
await fileExport.getDescription() // 'Say hello.'
await fileExport.getTags() // [{ name: 'category', value: 'greetings' }]
```
