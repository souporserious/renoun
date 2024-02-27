# create-mdxts

## 0.3.4

### Patch Changes

- 7ce1fdf: Fix key warning in generated collection page.

## 0.3.3

### Patch Changes

- 2bfcb8c: Add better CLI create source template that also renders a collection page to display all source item links.
- 882ea4f: Cancel version check fetch request if it takes longer than a second.
- c17cd1e: Display a link to the collection page upon successful create source onboarding in CLI.

## 0.3.2

### Patch Changes

- bd8a219: Use cached package version check to reduce chance of network timeouts.

## 0.3.1

### Patch Changes

- 190b10a: Fix bad codemod in `generateStaticParams` when creating data source through CLI.
- 82392e2: Fix ESM in CJS error in CLI.
- fa557c5: Only log warning when git remote origin cannot be found.

## 0.3.0

### Minor Changes

- 018010d: Add `generateStaticParams` when creating source through CLI.
- 00a9c3c: Prompt yes/no before adding git source.
- d32efc1: Throw error if @next/mdx is configured and ask to remove when onboarding CLI.
- 19d82bd: Move `gitSource` url codemod to the CLI and add support for other git providers.

### Patch Changes

- dda11e3: Fix CLI bug with `next.config.mjs` being created even when js config previously exists.
- 1e9cdfe: Add file pattern if none provided when onboarding `createSource` through the CLI.
- e2812c3: Fix CLI codemod not creating a catch-all route.
- 61266e6: Use better inferred basename from file pattern when onboarding through CLI.
- 0f15473: If file pattern starts with a separator add a period for the relative path.
- fd4d4a1: Add summary of created files when creating source through CLI.

## 0.2.2

### Patch Changes

- 40790ea: Add list of all dependencies installed by CLI.

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
