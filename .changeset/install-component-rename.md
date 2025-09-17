---
'renoun': minor
---

Renames `PackageInstall` component to `Command` and switches to using `children` prop for providing package commands instead of a `packages` prop. This also adds `defaultPackageManager` and `includeInstallScript` configuration props to `RootProvider`.

```diff
- <PackageInstall>renoun</PackageInstall>
+ <Command variant="install">renoun</Command>
```

This also introduces new variants:

- `install` - for install commands
- `install-dev` - for install dev commands
- `run` - for run commands
- `exec` - for exec commands
- `create` - for create commands

### Breaking Changes

Rename `PackageInstall` call sites to `Command` with `variant="install"` and remove the `packages` prop and pass as `children` directly.
