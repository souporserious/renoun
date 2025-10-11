---
'renoun': minor
---

Adds protocol-aware path resolution to the file system `Directory` and `File` utilities starting with a `workspace:` protocol. This will change the working directory to start from the root workspace directory:

```ts
import { Directory } from 'renoun'

const examples = new Directory({ path: 'workspace:examples' })
```
