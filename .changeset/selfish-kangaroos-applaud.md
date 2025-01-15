---
'renoun': minor
---

Adds an overload to `Directory#getFile` that allows for querying files by their path including the extension instead of needing to provide the extension separately:

```ts
const rootDirectory = new Directory()
const file = await rootDirectory.getFile('tsconfig.json')
```
