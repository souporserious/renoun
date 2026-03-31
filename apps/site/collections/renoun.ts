import {
  Directory,
  FileNotFoundError,
  isDirectory,
  isJavaScriptFile,
  type FileSystemEntry,
} from 'renoun'
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

export const PublicComponentsDirectory = new Directory({
  ...componentDirectoryOptions,
  filter: shouldIncludePublicComponentEntry,
})

export async function shouldIncludePublicComponentEntry(
  entry: FileSystemEntry<any>
): Promise<boolean> {
  const normalizedRelativePath = normalizeComponentEntryPath(entry.relativePath)

  if (isDirectory(entry)) {
    if (isExamplesDirectoryPath(normalizedRelativePath)) {
      return true
    }

    if (normalizedRelativePath.includes('/examples/')) {
      return false
    }

    const componentFile = await entry
      .getFile(entry.baseName, ['ts', 'tsx'])
      .catch((error) => {
        if (error instanceof FileNotFoundError) {
          return undefined
        }
        throw error
      })

    if (!componentFile) {
      return false
    }

    return (await componentFile.getExports()).length > 0
  }

  if (!isJavaScriptFile(entry)) {
    return false
  }

  if (entry.extension !== 'ts' && entry.extension !== 'tsx') {
    return false
  }

  if (isExamplesDirectoryPath(normalizedRelativePath)) {
    return false
  }

  if (
    normalizedRelativePath.includes('/examples/') ||
    normalizedRelativePath.endsWith('.examples.ts') ||
    normalizedRelativePath.endsWith('.examples.tsx')
  ) {
    return false
  }

  const parentRelativePath = normalizeComponentEntryPath(
    entry.getParent().relativePath
  )
  if (parentRelativePath.length > 0) {
    if (entry.baseName !== entry.getParent().baseName) {
      return false
    }

    return (await entry.getExports()).length > 0
  }

  const normalizedBaseName = entry.baseName.toLowerCase()
  if (normalizedBaseName === 'index' || normalizedBaseName === 'readme') {
    return false
  }

  return (await entry.getExports()).length > 0
}

function normalizeComponentEntryPath(relativePath: string): string {
  return relativePath.replaceAll('\\', '/').toLowerCase()
}

function isExamplesDirectoryPath(normalizedRelativePath: string): boolean {
  return (
    normalizedRelativePath === 'examples' ||
    normalizedRelativePath.endsWith('/examples')
  )
}

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
