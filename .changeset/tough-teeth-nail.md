---
'renoun': minor
---

Removes the `PackageInstallScript` component in favor of a hoisted script element. This removes the need to render this component in the layout file manually and will now be automatically be hoisted the first time the `PackageInstall` component is rendered.
