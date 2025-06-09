---
'renoun': minor
---

Renames the `Directory` and `File` path methods to better align with their intended use. The `basePath` constructor option has also been renamed to `baseRoutePath` to match the new naming convention. Additionally, the `baseRoutePath` option now defaults to the root directory's slug since this is the most common use case.

### Breaking Changes

Rename any call sites that use the following `Directory` and `File` methods:

- `getPath` to `getRoutePath`
- `getPathSegments` to `getRouteSegments`

In most cases, you can remove the `baseRoutePath` option from your code if you were using it to set the base path for a directory. It now defaults to the root directory's slug:

```diff
import { Directory } from 'renoun/file-system';

const directory = new Directory({
    path: 'components',
--  basePath: 'components'
});
const file = await directory.getFile('button')
file.getRoutePath() // '/components/button'
```
