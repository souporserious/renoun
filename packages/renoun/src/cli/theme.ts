import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { ALLOWED_SCOPES, pruneTheme, type VSCodeTheme } from '../theme/prune.ts'

function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`
}

export async function runThemeCommand(themeArgument?: string): Promise<void> {
  if (!themeArgument) {
    console.error('Usage: renoun theme <path-to-theme.json>')
    process.exit(1)
  }

  const themePath = path.resolve(process.cwd(), themeArgument)

  let themeText: string
  try {
    themeText = await readFile(themePath, 'utf8')
  } catch (error) {
    console.error(`Could not read theme file at ${themePath}`)
    if (error instanceof Error && error.message) {
      console.error(error.message)
    }
    process.exit(1)
  }

  let theme: VSCodeTheme
  try {
    theme = JSON.parse(themeText) as VSCodeTheme
  } catch (error) {
    console.error(`Theme file is not valid JSON: ${themePath}`)
    if (error instanceof Error && error.message) {
      console.error(error.message)
    }
    process.exit(1)
  }

  const prunedTheme = pruneTheme(theme, ALLOWED_SCOPES)
  const formatted = JSON.stringify(prunedTheme, null, 2)

  await writeFile(themePath, ensureTrailingNewline(formatted), 'utf8')

  const displayPath = path.relative(process.cwd(), themePath) || themePath
  console.log(`✓ Pruned theme: ${displayPath}`)
}
