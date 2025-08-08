---
'@renoun/mdx': minor
---

Allows MDX files to override the exported `headings` variable by exporting a `getHeadings` function.

```hello-world.mdx
export function getHeadings(headings) {
  return [
    ...headings,
    { id: 'extra', level: 2, text: 'Extra', children: 'Extra' },
  ]
}

# Hello World
```

This will now include the extra headings when importing them from the file:

```tsx allowErrors
import Content, { headings } from 'hello-world.mdx'
```

This feature is disabled by default for security purposes, please import and configure this plugin to enable:

```tsx
import { remarkAddHeadings } from '@renoun/mdx/add-headings'
import { evaluate } from '@mdx-js/mdx'

const result = await evaluate('# Hello World', {
  remarkPlugins: [[addHeadings, { allowGetHeadings: true }]],
})
```
