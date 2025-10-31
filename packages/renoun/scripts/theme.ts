import fs from 'node:fs'
import path from 'node:path'

import {
  ALLOWED_SCOPES,
  pruneTheme,
  toJsonModule,
  type VSCodeTheme,
} from '../src/theme/prune.ts'

async function main() {
  const themePath = path.resolve('vendor/theme.json')
  if (fs.existsSync(themePath)) {
    const theme: VSCodeTheme = JSON.parse(fs.readFileSync(themePath, 'utf8'))
    const prunedTheme = pruneTheme(theme, ALLOWED_SCOPES)
    const themeOut = path.resolve('src/theme.ts')
    fs.mkdirSync(path.dirname(themeOut), { recursive: true })
    fs.writeFileSync(
      themeOut,
      toJsonModule(JSON.stringify(prunedTheme)),
      'utf8'
    )
  }

  console.log('✓ Pruned theme')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
