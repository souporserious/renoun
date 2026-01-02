import { Directory } from 'renoun'
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

export const ComponentsDirectory = new Directory({
  path: '../../packages/renoun/src/components',
  filter: '**/*.{ts,tsx}',
  repository: 'souporserious/renoun',
  schema: {
    mdx: {
      metadata: z.object({
        title: z.string(),
        description: z.string(),
      }),
    },
  },
  loader: {
    ts: (path) =>
      import(
        /* webpackInclude: /(?:\.examples|\/examples\/).*\.tsx?$/ */
        `../../../packages/renoun/src/components/${path}.ts`
      ) as Promise<ComponentSchema>,
    tsx: (path) =>
      import(
        /* webpackInclude: /(?:\.examples|\/examples\/).*\.tsx?$/ */
        `../../../packages/renoun/src/components/${path}.tsx`
      ) as Promise<ComponentSchema>,
    mdx: (path) =>
      import(`../../../packages/renoun/src/components/${path}.mdx`),
  },
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
    ts: (path) =>
      import(
        /* webpackInclude: /(?:\.examples|\/examples\/).*\.tsx?$/ */
        `../../../packages/renoun/src/hooks/${path}.ts`
      ) as Promise<HookSchema>,
    tsx: (path) =>
      import(
        /* webpackInclude: /(?:\.examples|\/examples\/).*\.tsx?$/ */
        `../../../packages/renoun/src/hooks/${path}.tsx`
      ) as Promise<HookSchema>,
    mdx: (path) => import(`../../../packages/renoun/src/hooks/${path}.mdx`),
  },
})
