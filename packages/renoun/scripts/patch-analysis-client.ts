import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const DIST_PATH = 'dist/analysis/client.js'
const START_MARKER = 'async function importAnalysisClientServerModules() {'
const END_MARKER = 'async function loadAnalysisClientServerModules() {'

const REPLACEMENT = `async function importAnalysisClientServerModuleAtRuntime() {
    const runtimeImport = Function('specifier', 'return import(specifier)');
    const [{ createRequire }, { dirname, join }, { pathToFileURL }] = await Promise.all([
        runtimeImport('node:module'),
        runtimeImport('node:path'),
        runtimeImport('node:url'),
    ]);
    const require = createRequire(import.meta.url);
    const packageEntryPath = require.resolve('renoun');
    const serverModuleUrl = pathToFileURL(join(dirname(packageEntryPath), 'analysis', 'client.server.js')).href;
    return runtimeImport(serverModuleUrl);
}
async function importAnalysisClientServerModules() {
    if (shouldLoadBrowserAnalysisClientServerModule()) {
        if (isSourceAnalysisClientModule()) {
            return import("./client.server.browser.js");
        }
        return import('./client.server.browser.js');
    }
    return importAnalysisClientServerModuleAtRuntime();
}
`

function fail(message: string): never {
  throw new Error(`[patch-analysis-client] ${message}`)
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export function patchAnalysisClientText(text: string): string {
  const startIndex = text.indexOf(START_MARKER)
  if (startIndex === -1) {
    fail(`Could not find start marker in ${DIST_PATH}`)
  }

  const endIndex = text.indexOf(END_MARKER, startIndex)
  if (endIndex === -1) {
    fail(`Could not find end marker in ${DIST_PATH}`)
  }

  return (
    text.slice(0, startIndex) + REPLACEMENT + text.slice(endIndex)
  )
}

export async function patchAnalysisClient(): Promise<void> {
  if (!(await exists(DIST_PATH))) {
    fail(`Missing dist file: ${DIST_PATH}`)
  }

  const text = await fs.readFile(DIST_PATH, 'utf8')
  const patchedText = patchAnalysisClientText(text)

  await fs.mkdir(path.dirname(DIST_PATH), { recursive: true })
  await fs.writeFile(DIST_PATH, patchedText, 'utf8')

  console.log(
    `[patch-analysis-client] rewrote ${DIST_PATH} to hide server-only imports from client bundlers`
  )
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  patchAnalysisClient().catch((error) => {
    console.error(error.stack ?? String(error))
    process.exitCode = 1
  })
}
