---
'renoun': minor
---

Removes `getEditPath` in favor of `getEditUrl` and `getEditorUri` for a more explicit API. Prior, the `getEditPath` method switched between the editor and the git provider source based on the environment. This was confusing and not always the desired behavior. Now you can explicitly choose the behavior you want.

### Breaking Changes

The `getEditPath` method has been removed. Use `getEditUrl` and `getEditorUri` instead.

To get the same behavior as `getEditPath` you can use both `getEditUrl` and `getEditorUri` together:

```ts
import { Directory } from 'renoun/file-system'

const directory = new Directory('src/components')
const file = directory.getFileOrThrow('Button', 'tsx')
const editUrl =
  process.env.NODE_ENV === 'development'
    ? file.getEditorUri()
    : file.getEditUrl()
```
