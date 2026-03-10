import { promises as fs } from 'node:fs'

const DIST_ANALYSIS_CLIENT_PATH = 'dist/analysis/client.js'
const SOURCE_SPECIFIER = "import('#analysis-client-server')"
const DIST_SPECIFIER = "import('#analysis-client-server-dist')"

async function main() {
  const text = await fs.readFile(DIST_ANALYSIS_CLIENT_PATH, 'utf8')

  if (text.includes(DIST_SPECIFIER)) {
    console.log(
      `[patch-analysis-client-imports] ${DIST_ANALYSIS_CLIENT_PATH} already references ${DIST_SPECIFIER}`
    )
    return
  }

  if (!text.includes(SOURCE_SPECIFIER)) {
    throw new Error(
      `[patch-analysis-client-imports] Expected ${DIST_ANALYSIS_CLIENT_PATH} to reference ${SOURCE_SPECIFIER}`
    )
  }

  await fs.writeFile(
    DIST_ANALYSIS_CLIENT_PATH,
    text.replaceAll(SOURCE_SPECIFIER, DIST_SPECIFIER),
    'utf8'
  )

  console.log(
    `[patch-analysis-client-imports] rewrote ${DIST_ANALYSIS_CLIENT_PATH} to use ${DIST_SPECIFIER}`
  )
}

main().catch((error) => {
  console.error(error.stack ?? String(error))
  process.exitCode = 1
})
