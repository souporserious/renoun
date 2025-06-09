---
'renoun': major
---

Renames the following `Directory` and `File` methods to be more aligned with their intended use:

- `getPath` to `getRoutePath`
- `getPathSegments` to `getRouteSegments`

The `basePath` constructor option has also been renamed to `baseRoutePath` to match the new naming convention. Additionally, the `baseRoutePath` option now defaults to the root directory's slug since this is the most common use case.
