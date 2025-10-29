---
'renoun': minor
---

Adds configurable `sources` prop to `RootProvider` in place of the `figma` option:

- `RootProvider`: The new `sources` prop allows defining custom sources, e.g. `sources={{ icons: { type: 'figma', fileId }, illustration: { type: 'figma', fileId, basePathname: 'illustration' } }}`.
- `Image`: Can use these sources, e.g. `icons:arrow-up` or `illustration:marketing`. Names are resolved by components first, then frames/groups. If `basePathname` is provided, it also matches names like `illustration/<path>`.
