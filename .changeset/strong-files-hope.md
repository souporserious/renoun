---
'mdxts': minor
---

Rewrites relative import specifiers pointing outside of the project to use the package name if possible:

`import { getTheme } from '../../mdxts/src/components'` -> `import { getTheme } from 'mdxts/components'`
