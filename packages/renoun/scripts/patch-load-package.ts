import { Project } from 'ts-morph'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const SOURCE_PATH = 'src/utils/load-package.ts'
const DIST_PATH = 'dist/utils/load-package.js'
const IDENTIFIER = '__rewriteRelativeImportExtension'
const TSCONFIG_CANDIDATES = ['tsconfig.build.json', 'tsconfig.json']

function fail(message: string): never {
  throw new Error(`[patch-load-package] ${message}`)
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Rewrites relative imports that end with `.ts`, `.tsx`, `.mts`, or `.cts`
 * to `.js`, `.mjs`, or `.cjs` respectively.
 * It now correctly avoids inserting an extra `.`.
 */
function rewriteRelativeImportExtensions(text: string): string {
  return text.replace(
    /(["'])(\.\.?\/[^"']*?)(?:\.d)?\.(ts|tsx|mts|cts)([?#][^"']*)?\1/g,
    (
      match,
      quote: string,
      specifier: string,
      extension: string,
      suffix?: string
    ) => {
      let newExtension: string
      switch (extension) {
        case 'mts':
          newExtension = 'mjs'
          break
        case 'cts':
          newExtension = 'cjs'
          break
        default:
          newExtension = 'js'
          break
      }

      return `${quote}${specifier}.${newExtension}${suffix ?? ''}${quote}`
    }
  )
}

async function main() {
  if (!(await exists(SOURCE_PATH))) {
    fail(`Missing source file: ${SOURCE_PATH}`)
  }

  let tsConfigFilePath: string | undefined
  for (const candidate of TSCONFIG_CANDIDATES) {
    if (await exists(candidate)) {
      tsConfigFilePath = candidate
      break
    }
  }

  if (!tsConfigFilePath) {
    fail(
      `Could not find a tsconfig (${TSCONFIG_CANDIDATES.join(', ')}) in the current working directory.`
    )
  }

  const project = new Project({
    tsConfigFilePath,
    compilerOptions: {
      allowImportingTsExtensions: true,
      rewriteRelativeImportExtensions: false,
      noEmitOnError: false,
      removeComments: false,
    },
  })

  const sourceFile =
    project.getSourceFile(SOURCE_PATH) ??
    project.addSourceFileAtPath(SOURCE_PATH)

  const emitOutput = sourceFile.getEmitOutput()

  if (emitOutput.getEmitSkipped()) {
    const diagnostics = project.getPreEmitDiagnostics()
    const formatted = project.formatDiagnosticsWithColorAndContext(diagnostics)
    fail(`Emit was skipped. Diagnostics:\n${formatted}`)
  }

  const outputFiles = emitOutput.getOutputFiles()
  const emitted = outputFiles.find((file) =>
    /load-package\.(?:js|mjs|cjs)$/.test(file.getFilePath())
  )

  if (!emitted) {
    fail(
      `Could not find emitted JS for ${SOURCE_PATH}. Output files:\n` +
        outputFiles.map((f) => `- ${f.getFilePath()}`).join('\n')
    )
  }

  let text = emitted.getText()

  if (text.includes(IDENTIFIER)) {
    fail(
      `Emitted output still contains "${IDENTIFIER}". Expected rewriteRelativeImportExtensions=false to avoid helper insertion.`
    )
  }

  // Fix import paths (.ts → .js, etc.)
  text = rewriteRelativeImportExtensions(text)

  await fs.mkdir(path.dirname(DIST_PATH), { recursive: true })
  await fs.writeFile(DIST_PATH, text, 'utf8')

  console.log(
    `[patch-load-package] emitted ${SOURCE_PATH} -> ${DIST_PATH} (rewrote import extensions, no helper)`
  )
}

main().catch((error) => {
  console.error(error.stack ?? String(error))
  process.exitCode = 1
})
