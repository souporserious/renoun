---
'renoun': patch
---

Fixes CLI app mode incorrectly stripping leading dots from dotfiles (e.g. `.gitignore` was being normalized to `gitignore`), causing `ENOENT` errors when applying project overrides.

