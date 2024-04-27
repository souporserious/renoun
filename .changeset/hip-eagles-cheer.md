---
'mdxts': minor
---

Normalizes the internal `getEntrySourceFiles` utility that is responsible for determining what TypeScript data sources are public based on `package.json` exports, index files, and top-level directories.

To determine what source files should be considered public when dealing with package exports, `createSource` gets two new options used to remap `package.json` exports to their original source files:

```ts
import { createSource } from 'mdxts'

const allPackages = createSource('../packages/mdxts/src/**/*.{ts,tsx}', {
  sourceDirectory: 'src',
  outputDirectory: 'dist',
})
```

Using a subset of the `mdxts` `package.json` exports as an example:

```json
"exports": {
  ".": {
    "types": "./dist/src/index.d.ts",
    "import": "./dist/src/index.js",
    "require": "./dist/cjs/index.js"
  },
  "./components": {
    "types": "./dist/src/components/index.d.ts",
    "import": "./dist/src/components/index.js",
    "require": "./dist/cjs/components/index.js"
  },
},
```

These would be remapped to their original source files, filtering out any paths gathered from the `createSource` pattern not explicitly exported:

```json
["../packages/mdxts/src/index.ts", "../packages/mdxts/src/components/index.ts"]
```
