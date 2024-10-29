---
'renoun': major
---

Simplifies how `baseDirectory` works for `Collection`. This was from a legacy implementation that was not well thought out and caused confusion. This change makes it more explicit and easier to understand.

### Breaking Changes

The `baseDirectory` option for `Collection` is now required to be separate from `filePattern`:

```diff
import { Collection } from 'renoun/collections'

const components = new Collection({
--  filePattern: 'src/components/**/*.ts',
++  filePattern: '**/*.ts',
--  baseDirectory: 'components',
++  baseDirectory: 'src/components',
})
```
