# create-renoun

## 1.2.0

### Minor Changes

- a862ea2: Updates all dependencies to latest version.

## 1.1.0

### Minor Changes

- 2a150d6: Updates custom readline implementation to use `@clack/prompts`.

## 1.0.0

### Major Changes

- 35921f5: Adds the initial release of the `create-renoun` CLI. This package is a scaffolding tool for renoun examples. It provides a simple way to clone an example with the necessary configuration and dependencies.

## 0.4.1

### Patch Changes

- d0ab9a3: Update dependencies.

## 0.4.0

### Minor Changes

- 64eeaf0: Updates license from MIT to AGPL-3.0. This ensures that modifications and improvements to the code remain open source and accessible to the community.

## 0.3.11

### Patch Changes

- b35373c: Fixes error when trying to find previous version cache that doesn't exist yet.

## 0.3.10

### Patch Changes

- 4be36bc: Save version check to local cache.
- 29c8865: Uses the correct working directory when creating example files.

## 0.3.9

### Patch Changes

- 1468536: Add .gitignore file when cloning example.
- dcf722b: Fixes specifying a custom directory to copy examples to.

## 0.3.8

### Patch Changes

- 300587c: Fixes ESM chalk error by downgrading to previous version.

## 0.3.7

### Patch Changes

- 24f9a9b: Fixes fetching the wrong version when reformatting the mdxts package version downloaded from examples.
- acfc425: Fixes `undefined` in message when using example option in CLI.
- 9a69392: Adds link to blog example when first onboarding through the CLI.
- 96e401b: Fixes incorrect CLI outdated version comparison.

## 0.3.6

### Patch Changes

- 77c4c10: Improves CLI onboarding by prompting to copy the blog example if not run in a project.

## 0.3.5

### Patch Changes

- 332af8f: Only install `mdxts` dependency when onboarding.

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
