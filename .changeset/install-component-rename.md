---
'renoun': minor
---

Renames `PackageInstall` component to `Command` and switches to using `children` prop for providing package commands instead of a `packages` prop. This also adds `defaultPackageManager` and `includeInstallScript` configuration props to `RootProvider`.

### Breaking Changes

Rename `PackageInstall` call sites to `Install` and rename `packages` prop to `children` or pass packages directly.
