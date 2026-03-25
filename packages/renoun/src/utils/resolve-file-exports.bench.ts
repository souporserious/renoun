import { beforeAll, bench, describe } from 'vitest'

import { resolveFileExportsWithDependencies } from './resolve-file-exports.ts'
import { getTsMorph } from './ts-morph.ts'

const { Project, ts } = getTsMorph()

const isCI =
  process.env['CI'] === 'true' || process.env['GITHUB_ACTIONS'] === 'true'
const BENCH_OPTIONS = {
  time: isCI ? 1_500 : 500,
  warmupTime: isCI ? 750 : 200,
} as const
const EXPORT_COUNT = 250

let project!: InstanceType<typeof Project>

beforeAll(() => {
  project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      allowJs: true,
      checkJs: true,
    },
  })

  const largeModuleText = Array.from(
    { length: EXPORT_COUNT },
    (_, index) => `export const value${index} = ${index};`
  ).join('\n')

  project.createSourceFile('/project/large.js', largeModuleText, {
    overwrite: true,
    scriptKind: ts.ScriptKind.JS,
  })
  project.createSourceFile(
    '/project/index.js',
    [
      "import * as Large from './large.js'",
      'export { Large }',
      "export * from './large.js'",
    ].join('\n'),
    {
      overwrite: true,
      scriptKind: ts.ScriptKind.JS,
    }
  )
})

describe('resolveFileExportsWithDependencies', () => {
  bench(
    'large barrel with namespace-import re-export',
    async () => {
      await resolveFileExportsWithDependencies(project, '/project/index.js')
    },
    BENCH_OPTIONS
  )
})
