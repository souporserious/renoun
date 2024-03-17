---
'mdxts': minor
---

Adds RSS feed helper for `createSource` and `mergeSources`:

```js
import { createSource } from 'mdxts'

const mdxSource = createSource('*/**/*.mdx')

mdxSource.rss()
```
