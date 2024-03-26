---
'mdxts': minor
---

Reformat `createSource.all` method to return an array instead of an object.

```diff
const allDocs = createSource('docs/*.mdx')
---Object.values(allDocs.all()).map((doc) => ...)
+++allDocs.all().map((doc) => ...)
```
