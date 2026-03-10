import { promises as fs } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const DIST_ANALYSIS_CLIENT_PATH = 'dist/analysis/client.js'
export const SOURCE_SPECIFIER = "import('#analysis-client-server')"
export const DIST_SPECIFIER = "import('#analysis-client-server-dist')"

export function rewriteAnalysisClientImports(text: string): string {
  if (text.includes(DIST_SPECIFIER)) {
    return text
  }

  if (!text.includes(SOURCE_SPECIFIER)) {
    throw new Error(
      `[patch-analysis-client-imports] Expected ${DIST_ANALYSIS_CLIENT_PATH} to reference ${SOURCE_SPECIFIER}`
    )
  }

  return text.replaceAll(SOURCE_SPECIFIER, DIST_SPECIFIER)
}

export async function patchAnalysisClientImports(
  filePath = DIST_ANALYSIS_CLIENT_PATH
): Promise<'already-patched' | 'patched'> {
  const text = await fs.readFile(filePath, 'utf8')
  const nextText = rewriteAnalysisClientImports(text)

  if (nextText === text) {
    console.log(
      `[patch-analysis-client-imports] ${filePath} already references ${DIST_SPECIFIER}`
    )
    return 'already-patched'
  }

  await fs.writeFile(filePath, nextText, 'utf8')
  console.log(
    `[patch-analysis-client-imports] rewrote ${filePath} to use ${DIST_SPECIFIER}`
  )
  return 'patched'
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectExecution) {
  patchAnalysisClientImports().catch((error) => {
    console.error(error.stack ?? String(error))
    process.exitCode = 1
  })
}
