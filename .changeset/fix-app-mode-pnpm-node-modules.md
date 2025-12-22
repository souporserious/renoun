---
'renoun': patch
---

Fixes CLI app mode failing to resolve dependencies like `zod` and `restyle`. The runtime directory now correctly symlinks `node_modules` based on how the app package is installed:

- **pnpm virtual store**: Uses the parent directory's `node_modules` from `.pnpm/<pkg>/node_modules/`
- **Workspace packages**: Uses the app's own `node_modules` directory
- **Fallback**: Uses the project's root `node_modules`
