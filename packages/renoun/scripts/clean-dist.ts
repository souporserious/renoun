import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const distPath = join(packageRoot, 'dist')

rmSync(distPath, { recursive: true, force: true })
