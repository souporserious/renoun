---
'renoun': minor
---

Adds the ability to override the value type for the `JavaScriptFile#getExportValue` method. This is helpful for building strongly typed utilities.

```ts
const metadata = await entry.getExportValue<{
  title: string
  date: Date
}>('metadata')

metadata.title // string
metadata.date // Date
```
