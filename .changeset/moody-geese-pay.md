---
'mdxts': minor
---

Cleans up type errors to be more understandable and adds a configuration to highlight errors in the terminal:

```ts
import { createMdxtsPlugin } from 'mdxts'

const withMdxtsPlugin = createMdxtsPlugin({ highlightErrors: true })

export default withMdxtsPlugin()
```
