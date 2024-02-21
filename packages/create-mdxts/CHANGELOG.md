# create-mdxts

## 0.2.1

### Patch Changes

- 75ce1e5: Add codemod for next-compose-plugins in CLI onboarding.

## 0.2.0

### Minor Changes

- 0f24dfa: Use default config when file contents is empty. This is unlikely to happen, but improves the experience by avoiding erroring.
- 4dda95e: Implement example CLI flag.
- 8af7ab4: Add create source and app page CLI step.
- 1c329b6: Revamps the CLI to add better colors and present steps as questions.
- 8d59ffd: Handle Next functional configs in CLI codemod.
- ed57144: Make sure TypeScript is installed before proceeding in CLI.

### Patch Changes

- 8a02067: Check if mdxts/next plugin is already configured before prompting.

## 0.1.1

### Patch Changes

- c396612: Fix bad next dependency conditional.

## 0.1.0

### Minor Changes

- 7311b67: Add codemods for Next js and mjs configs.

### Patch Changes

- 66a0442: Create mjs next config if no config exists.
- f84e05e: Add shiki and prettier to package install.
- 23eda0b: Fix esm error from update-notifier.

## 0.0.1

### Patch Changes

- f5ad5ab: Add `create-mdxts` cli package.
