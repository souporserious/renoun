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
  schema: {
    mdx: {
      metadata: z.object({
        title: z.string(),
        description: z.string(),
      }),
    },
  },
  loader: {
    ts: (path): Promise<ComponentSchema> =>
      import(
        /* webpackInclude: /(?:\.examples|\/examples\/).*\.tsx?$/ */
        `../../../packages/renoun/src/components/${path}.ts`
      ),
    tsx: (path): Promise<ComponentSchema> =>
      import(
        /* webpackInclude: /(?:\.examples|\/examples\/).*\.tsx?$/ */
        `../../../packages/renoun/src/components/${path}.tsx`
      ),
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
