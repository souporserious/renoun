---
'renoun': minor
---

Adds a new `PackageManager` utility (reads package.json `packageManager`, lockfiles, and can optionally fall back to what's installed on the machine:

```ts
import { PackageManager } from 'renoun'

const packageManager = new PackageManager()

// Build commands that match the detected package manager.
const install = packageManager.install(['react', 'react-dom'])
const installDev = packageManager.install('typescript', { dev: true })

packageManager.run('dev') // 'pnpm dev' (if pnpm is detected)
```
