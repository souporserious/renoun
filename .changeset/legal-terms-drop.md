---
'renoun': minor
---

Adds `MDXFile`, `MDXFileExport`, and `isMDXFile` classes and utilities to better differentiate between specific MDX and JavaScript file methods. This also helps with performance since we should never attempt to analyze an MDX file using the TypeScript compiler and allows for future MDX-specific methods to be added.

### Breaking Changes

In some cases there may be breaking changes if you were loading mdx files and targeting `JavaScriptFile` related classes or types. These should be transitioned to the new `MDXFile`, `MDXFileExport`, and `isMDXFile` respectively.
