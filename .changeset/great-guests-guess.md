---
'mdxts': minor
---

Adds RSS feed helper for `createSource` and `mergeSources`:

```js
// app/rss.xml/route.js
import { allData } from 'data'

export async function GET() {
  const feed = await allData.rss({
    title: 'MDXTS - The Content & Documentation SDK for React',
    description: `Type-safe content and documentation.`,
    copyright: `©${new Date().getFullYear()} @souporserious`,
  })
  return new Response(feed)
}
```
