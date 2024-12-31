---
'renoun': minor
---

Allows instantiating `File` and `JavaScriptFile` more easily using only a `path`:

```ts
import { JavaScriptFile } from 'renoun/file-system'

const indexFile = new JavaScriptFile({ path: 'src/index.ts' })
const indexFileExports = await indexFile.getExports()
```
