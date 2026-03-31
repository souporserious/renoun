import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { Collection, Directory, type FileSystemEntry } from 'renoun'
import { z } from 'zod'

export const FileSystemDirectory = new Directory({
  path: '../../packages/renoun/src/file-system',
  basePathname: 'utilities',
  loader: {
    mdx: (path) => {
      return import(`../../../packages/renoun/src/file-system/${path}.mdx`)
    },
  },
})

type ComponentSchema = Record<string, React.ComponentType>

const componentDirectoryOptions = {
  path: '../../packages/renoun/src/components',
  schema: {
    mdx: {
      metadata: z.object({
        title: z.string(),
        description: z.string(),
      }),
    },
  },
  loader: {
    ts: (path: string): Promise<ComponentSchema> =>
      import(
        /* webpackInclude: /(?:\.examples|\/examples\/).*\.tsx?$/ */
        `../../../packages/renoun/src/components/${path}.ts`
      ),
    tsx: (path: string): Promise<ComponentSchema> =>
      import(
        /* webpackInclude: /(?:\.examples|\/examples\/).*\.tsx?$/ */
        `../../../packages/renoun/src/components/${path}.tsx`
      ),
    mdx: (path: string) =>
      import(`../../../packages/renoun/src/components/${path}.mdx`),
  },
}

export const ComponentsDirectory = new Directory({
  ...componentDirectoryOptions,
  filter: '**/*.{ts,tsx}',
})

const publicComponentEntryPaths = await readFile(
  resolve(process.cwd(), '../../packages/renoun/src/components/index.ts'),
  'utf8'
).then((sourceText) => {
  const entryPaths: string[] = []
  const seenEntryPaths = new Set<string>()

  for (const match of sourceText.matchAll(/from ['"]\.\/([^'"]+)['"]/g)) {
    const specifier = match[1]
    if (!specifier) {
      continue
    }

    const entryPath = specifier.endsWith('/index.ts')
      ? specifier.slice(0, -'/index.ts'.length)
      : specifier.replace(/\.(?:ts|tsx)$/, '')

    if (entryPath.length === 0 || seenEntryPaths.has(entryPath)) {
      continue
    }

    seenEntryPaths.add(entryPath)
    entryPaths.push(entryPath)
  }

  return entryPaths
})

export const PublicComponentEntries = await Promise.all(
  publicComponentEntryPaths.map((entryPath) =>
    ComponentsDirectory.getEntry(entryPath)
  )
)

const publicComponentPathnames = new Set(
  PublicComponentEntries.map((entry) => entry.getPathname())
)

export function isPublicComponentEntry(entry: FileSystemEntry<any>): boolean {
  return publicComponentPathnames.has(entry.getPathname())
}

export const PublicComponentsDirectory = new Collection({
  entries: PublicComponentEntries,
})

type HookSchema = Record<string, unknown>

export const HooksDirectory = new Directory({
  path: '../../packages/renoun/src/hooks',
  filter: '**/*.{ts,tsx}',
  schema: {
    mdx: {
      metadata: z.object({
        title: z.string(),
        description: z.string(),
      }),
    },
  },
  loader: {
    ts: (path): Promise<HookSchema> =>
      import(
        /* webpackInclude: /(?:\.examples|\/examples\/).*\.tsx?$/ */
        `../../../packages/renoun/src/hooks/${path}.ts`
      ),
    tsx: (path): Promise<HookSchema> =>
      import(
        /* webpackInclude: /(?:\.examples|\/examples\/).*\.tsx?$/ */
        `../../../packages/renoun/src/hooks/${path}.tsx`
      ),
    mdx: (path) => import(`../../../packages/renoun/src/hooks/${path}.mdx`),
  },
})
