import { bench, beforeAll, describe, it, expect } from 'vitest'
import {
  Directory,
  NodeFileSystem,
  MemoryFileSystem,
  withSchema,
  isFile,
  FileExportNotFoundError,
} from './index'

const mdxLoader = withSchema<{ frontmatter: { title: string } }>(
  (path) => import(`#fixtures/${path}.mdx`)
)
const tsDocsLoader = withSchema<{ metadata: { title: string } }>(
  (path) => import(`#fixtures/${path}.ts`)
)
const tsAnyLoader = withSchema<any>((path) => import(`#fixtures/${path}.ts`))
const tsxLoader = withSchema<any>((path) => import(`#fixtures/${path}.tsx`))

// Provide consistent, CI-aware benchmark options for stability across runs
const isCI =
  process.env['CI'] === 'true' || process.env['GITHUB_ACTIONS'] === 'true'
const BENCH_OPTIONS = {
  time: isCI ? 2000 : 750,
  warmupTime: isCI ? 1000 : 250,
} as const

// Run a benchmark body with NODE_ENV=production
async function withProduction<Type>(
  fn: () => Promise<Type> | Type
): Promise<Type> {
  const previousEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    return await fn()
  } finally {
    process.env.NODE_ENV = previousEnv
  }
}

let fixtures!: Directory<any>
let components!: Directory<any>
let docsMdxSortedByName!: Directory<any>
let docsMdxSortedByTitle!: Directory<any> // export-driven sort (if present)
let docsTsSortedByMetadata!: Directory<any>
let utilsTs!: Directory<any>
let cachedDocs!: Directory<any>
let docsMdxUnsorted!: Directory<any>
let docsDevCached!: Directory<any>
let originalEnv = process.env.NODE_ENV
let memoryFixtures!: Directory<any>

// Build a MemoryFileSystem snapshot from an on-disk directory for apples-to-apples comparisons
async function buildMemoryFsSnapshot(rootPath: string) {
  const nodeFs = new NodeFileSystem()
  const files: Record<string, string> = {}

  async function walk(path: string) {
    const entries = await nodeFs.readDirectory(path)
    for (const entry of entries) {
      if (entry.isDirectory) {
        await walk(entry.path)
      } else if (entry.isFile) {
        files[entry.path] = await nodeFs.readFile(entry.path)
      }
    }
  }

  await walk(rootPath)
  return new MemoryFileSystem(files)
}

beforeAll(async () => {
  const fs = new NodeFileSystem()

  fixtures = new Directory({
    path: 'fixtures',
    fileSystem: fs,
    loader: { mdx: mdxLoader, ts: tsAnyLoader, tsx: tsxLoader },
  })

  components = new Directory({
    path: 'fixtures/components',
    fileSystem: fs,
    loader: { mdx: mdxLoader, ts: tsAnyLoader, tsx: tsxLoader },
  })

  docsMdxSortedByName = new Directory({
    path: 'fixtures/docs',
    fileSystem: fs,
    include: '**/*.mdx',
    loader: { mdx: mdxLoader },
    sort: 'name', // primitive
  })

  docsMdxSortedByTitle = new Directory<{
    mdx: { frontmatter: { title: string } }
  }>({
    path: 'fixtures/docs',
    fileSystem: fs,
    include: '**/*.mdx',
    loader: { mdx: mdxLoader },
    sort: 'frontmatter.title',
  })

  docsTsSortedByMetadata = new Directory<{
    ts: { metadata: { title: string } }
  }>({
    path: 'fixtures/docs',
    fileSystem: fs,
    include: '**/*.ts',
    loader: { ts: tsDocsLoader },
    sort: 'metadata.title',
  })

  utilsTs = new Directory({
    path: 'fixtures/utils',
    fileSystem: fs,
    loader: { ts: tsAnyLoader },
  })

  // Unsorted baseline (for sort cost comparison)
  docsMdxUnsorted = new Directory({
    path: 'fixtures/docs',
    fileSystem: fs,
    include: '**/*.mdx',
    loader: { mdx: mdxLoader },
  })

  process.env.NODE_ENV = 'production'
  cachedDocs = new Directory({
    path: 'fixtures/docs',
    fileSystem: fs,
    include: '**/*',
    loader: { mdx: mdxLoader, ts: tsAnyLoader, tsx: tsxLoader },
  })
  // warm caches so the bench measures hot path
  await cachedDocs.getEntries()
  await cachedDocs.getEntries({
    recursive: true,
    includeDirectoryNamedFiles: true,
  })
  process.env.NODE_ENV = originalEnv

  // Development-mode cache warm for comparison to production cached path
  docsDevCached = new Directory({
    path: 'fixtures/docs',
    fileSystem: fs,
    include: '**/*',
    loader: { mdx: mdxLoader, ts: tsAnyLoader, tsx: tsxLoader },
  })
  await docsDevCached.getEntries()
  await docsDevCached.getEntries({
    recursive: true,
    includeDirectoryNamedFiles: true,
  })

  // Prepare in-memory fixtures snapshot for MemoryFileSystem benchmarks
  const memoryFs = await buildMemoryFsSnapshot('fixtures')
  memoryFixtures = new Directory({
    path: 'fixtures',
    fileSystem: memoryFs,
    loader: { mdx: mdxLoader, ts: tsAnyLoader, tsx: tsxLoader },
  })
})

it('sanity: MDX file resolves with real plugin', async () => {
  const f = await fixtures.getFile('docs/index', 'mdx')
  expect(isFile(f, 'mdx')).toBe(true)
})

describe('Directory.getEntries on fixtures', () => {
  bench(
    'fixtures (shallow scan)',
    async () => {
      await fixtures.getEntries()
    },
    BENCH_OPTIONS
  )

  bench(
    'components (recursive, includeDirectoryNamedFiles)',
    async () => {
      await components.getEntries({
        recursive: true,
        includeDirectoryNamedFiles: true,
      })
    },
    BENCH_OPTIONS
  )

  bench(
    'components (recursive, exclude directory-named files)',
    async () => {
      await components.getEntries({
        recursive: true,
        includeDirectoryNamedFiles: false,
      })
    },
    BENCH_OPTIONS
  )

  bench(
    'docs mdx (recursive include **/*.mdx)',
    async () => {
      await docsMdxSortedByName.getEntries({ recursive: true })
    },
    BENCH_OPTIONS
  )

  bench(
    'components (recursive, include index/readme files)',
    async () => {
      await components.getEntries({
        recursive: true,
        includeIndexAndReadmeFiles: true,
      })
    },
    BENCH_OPTIONS
  )

  bench(
    'components (recursive, exclude tsconfig-excluded files)',
    async () => {
      await components.getEntries({
        recursive: true,
        // default behavior excludes tsconfig excluded files
        includeTsConfigExcludedFiles: false,
      })
    },
    BENCH_OPTIONS
  )

  bench(
    'components (recursive, include tsconfig-excluded files)',
    async () => {
      await components.getEntries({
        recursive: true,
        includeTsConfigExcludedFiles: true,
      })
    },
    BENCH_OPTIONS
  )

  bench(
    'components (recursive, include dir-named + index/readme)',
    async () => {
      await components.getEntries({
        recursive: true,
        includeDirectoryNamedFiles: true,
        includeIndexAndReadmeFiles: true,
      })
    },
    BENCH_OPTIONS
  )
})

describe('Sorting via Directory.sort (real MDX + TS)', () => {
  bench(
    'docs mdx unsorted baseline',
    async () => {
      await docsMdxUnsorted.getEntries({ recursive: true })
    },
    BENCH_OPTIONS
  )

  bench(
    'docs mdx sorted by name (primitive key)',
    async () => {
      await docsMdxSortedByName.getEntries({ recursive: true })
    },
    BENCH_OPTIONS
  )

  bench(
    'docs mdx sorted by frontmatter.title (export-driven)',
    async () => {
      await docsMdxSortedByTitle.getEntries({ recursive: true })
    },
    BENCH_OPTIONS
  )

  bench(
    'docs ts sorted by metadata.title (export-driven)',
    async () => {
      await docsTsSortedByMetadata.getEntries()
    },
    BENCH_OPTIONS
  )
})

describe('Module resolution on fixtures (real MDX)', () => {
  bench(
    'resolve MDX default export for all docs pages',
    async () => {
      const entries = await docsMdxSortedByName.getEntries({ recursive: true })
      for (const entry of entries) {
        if (isFile(entry, 'mdx')) {
          // Always present — shouldn’t throw with real MDX plugin
          await entry.getExportValue('default')

          // Try a common optional export; ignore if not present to keep bench stable
          try {
            await entry.getExportValue('frontmatter')
          } catch (e) {
            if (!(e instanceof FileExportNotFoundError)) throw e
          }
        }
      }
    },
    BENCH_OPTIONS
  )

  bench(
    'resolve TSX default export for all component examples',
    async () => {
      const entries = await components.getEntries({ recursive: true })
      for (const entry of entries) {
        if (isFile(entry, 'tsx')) {
          try {
            await entry.getExportValue('default')
          } catch (e) {
            if (!(e instanceof FileExportNotFoundError)) throw e
          }
        }
      }
    },
    BENCH_OPTIONS
  )

  bench(
    'utils/path.ts -> basename() runtime call (real TS import)',
    async () => {
      const file = await utilsTs.getFile('path', 'ts')
      const basename = await file.getExportValue('basename')
      basename('fixtures/utils/path.ts', '.ts')
      basename('/a/b/c/file.test.tsx', '.tsx')
    },
    BENCH_OPTIONS
  )

  bench(
    'getFile path lookup (warm)',
    async () => {
      // Repeated lookups should hit the internal path lookup map
      for (let i = 0; i < 25; i++) {
        await fixtures.getFile('docs/index', 'mdx')
      }
    },
    BENCH_OPTIONS
  )

  bench(
    'getFile path lookup (cold, new Directory each time)',
    async () => {
      // Simulate cold lookups by constructing a fresh Directory each time
      for (let i = 0; i < 5; i++) {
        const fs = new NodeFileSystem()
        const coldFixtures = new Directory({
          path: 'fixtures',
          fileSystem: fs,
          loader: { mdx: mdxLoader, ts: tsAnyLoader, tsx: tsxLoader },
        })
        await coldFixtures.getFile('docs/index', 'mdx')
      }
    },
    BENCH_OPTIONS
  )

  bench(
    'construct Directory instances (no scan)',
    () => {
      for (let i = 0; i < 25; i++) {
        // Measure construction overhead separate from scanning
        // eslint-disable-next-line no-new
        new Directory({
          path: 'fixtures/docs',
          fileSystem: new NodeFileSystem(),
          loader: { mdx: mdxLoader, ts: tsAnyLoader, tsx: tsxLoader },
        })
      }
    },
    BENCH_OPTIONS
  )
})

describe('Cached path (development)', () => {
  bench(
    'docs (recursive scan, cold cache, dev env)',
    async () => {
      const coldDocs = new Directory({
        path: 'fixtures/docs',
        fileSystem: new NodeFileSystem(),
        include: '**/*',
        loader: { mdx: mdxLoader, ts: tsAnyLoader, tsx: tsxLoader },
      })
      await coldDocs.getEntries({
        recursive: true,
        includeDirectoryNamedFiles: true,
      })
    },
    BENCH_OPTIONS
  )

  bench(
    'docs (recursive scan, hot cache, dev env)',
    async () => {
      await docsDevCached.getEntries({
        recursive: true,
        includeDirectoryNamedFiles: true,
      })
    },
    BENCH_OPTIONS
  )
})

describe('Cached path (NODE_ENV=production)', () => {
  bench(
    'docs (recursive scan, cold cache)',
    async () => {
      await withProduction(async () => {
        // New directory instance to avoid using warmed cache
        const coldDocs = new Directory({
          path: 'fixtures/docs',
          fileSystem: new NodeFileSystem(),
          include: '**/*',
          loader: { mdx: mdxLoader, ts: tsAnyLoader, tsx: tsxLoader },
        })
        await coldDocs.getEntries({
          recursive: true,
          includeDirectoryNamedFiles: true,
        })
      })
    },
    BENCH_OPTIONS
  )

  bench(
    'docs (recursive scan, hot cache)',
    async () => {
      await withProduction(async () => {
        await cachedDocs.getEntries({
          recursive: true,
          includeDirectoryNamedFiles: true,
        })
      })
    },
    BENCH_OPTIONS
  )
})

describe('MemoryFileSystem vs NodeFileSystem scans', () => {
  bench(
    'memory: fixtures (recursive scan)',
    async () => {
      await memoryFixtures.getEntries({
        recursive: true,
        includeDirectoryNamedFiles: true,
      })
    },
    BENCH_OPTIONS
  )

  bench(
    'node: fixtures (recursive scan)',
    async () => {
      await fixtures.getEntries({
        recursive: true,
        includeDirectoryNamedFiles: true,
      })
    },
    BENCH_OPTIONS
  )
})

describe('Export hot path and type/metadata resolution (TS)', () => {
  bench(
    'utils/path.ts -> getExportValue("basename") hot (25x) [production]',
    async () => {
      await withProduction(async () => {
        const file = await utilsTs.getFile('path', 'ts')
        for (let index = 0; index < 25; index++) {
          await file.getExportValue('basename')
        }
      })
    },
    BENCH_OPTIONS
  )

  bench(
    'utils/path.ts -> getType("basename")',
    async () => {
      const file = await utilsTs.getFile('path', 'ts')
      const exp = await file.getExport('basename')
      await exp.getType()
    },
    BENCH_OPTIONS
  )

  bench(
    'utils/path.ts -> getText("basename")',
    async () => {
      const file = await utilsTs.getFile('path', 'ts')
      const exp = await file.getExport('basename')
      await exp.getText()
    },
    BENCH_OPTIONS
  )
})

describe('Static vs Runtime value resolution (TS)', () => {
  bench(
    'docs/introduction.ts -> metadata.getStaticValue() [production]',
    async () => {
      await withProduction(async () => {
        const file = await fixtures.getFile('docs/introduction', 'ts')
        const exp = await file.getExport('metadata')
        await exp.getStaticValue()
      })
    },
    BENCH_OPTIONS
  )

  bench(
    'docs/introduction.ts -> metadata.getRuntimeValue() [production]',
    async () => {
      await withProduction(async () => {
        const file = await fixtures.getFile('docs/introduction', 'ts')
        const exp = await file.getExport('metadata')
        await exp.getRuntimeValue()
      })
    },
    BENCH_OPTIONS
  )

  bench(
    'docs/introduction.ts -> metadata.getValue() [production]',
    async () => {
      await withProduction(async () => {
        const file = await fixtures.getFile('docs/introduction', 'ts')
        const exp = await file.getExport('metadata')
        await exp.getValue()
      })
    },
    BENCH_OPTIONS
  )
})

describe('Static vs Runtime value resolution (MDX)', () => {
  bench(
    'posts/getting-started.mdx -> frontmatter.getStaticValue() [production]',
    async () => {
      await withProduction(async () => {
        const file = await fixtures.getFile('posts/getting-started', 'mdx')
        const exp = await file.getExport('frontmatter')
        await exp.getStaticValue()
      })
    },
    BENCH_OPTIONS
  )

  bench(
    'posts/getting-started.mdx -> frontmatter.getRuntimeValue() [production]',
    async () => {
      await withProduction(async () => {
        const file = await fixtures.getFile('posts/getting-started', 'mdx')
        const exp = await file.getExport('frontmatter')
        await exp.getRuntimeValue()
      })
    },
    BENCH_OPTIONS
  )

  bench(
    'posts/getting-started.mdx -> frontmatter.getValue() [production]',
    async () => {
      await withProduction(async () => {
        const file = await fixtures.getFile('posts/getting-started', 'mdx')
        const exp = await file.getExport('frontmatter')
        await exp.getValue()
      })
    },
    BENCH_OPTIONS
  )
})

describe('Include filter performance', () => {
  bench(
    'docs: include pattern (**/*.mdx)',
    async () => {
      const dir = new Directory({
        path: 'fixtures/docs',
        fileSystem: new NodeFileSystem(),
        include: '**/*.mdx',
        loader: { mdx: mdxLoader },
      })
      await dir.getEntries({ recursive: true })
    },
    BENCH_OPTIONS
  )

  bench(
    'docs: include predicate (mdx files)',
    async () => {
      const dir = new Directory({
        path: 'fixtures/docs',
        fileSystem: new NodeFileSystem(),
        loader: { mdx: mdxLoader, ts: tsAnyLoader },
        include: (entry) => isFile(entry, 'mdx'),
      })
      await dir.getEntries({ recursive: true })
    },
    BENCH_OPTIONS
  )
})

describe('Concurrent scans (Promise.all)', () => {
  bench(
    'scan components + docs + utils concurrently',
    async () => {
      await Promise.all([
        components.getEntries({ recursive: true }),
        docsMdxSortedByName.getEntries({ recursive: true }),
        utilsTs.getEntries(),
      ])
    },
    BENCH_OPTIONS
  )
})
