import { Directory, withSchema } from 'renoun'
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
  loader: {
    ts: withSchema<ComponentSchema>(
      (path) =>
        import(
          /* webpackInclude: /(?:\.examples|\/examples\/).*\.tsx?$/ */
          `../../../packages/renoun/src/components/${path}.ts`
        )
    ),
    tsx: withSchema<ComponentSchema>(
      (path) =>
        import(
          /* webpackInclude: /(?:\.examples|\/examples\/).*\.tsx?$/ */
          `../../../packages/renoun/src/components/${path}.tsx`
        )
    ),
    mdx: withSchema(
      {
        metadata: z.object({
          title: z.string(),
          description: z.string(),
        }),
      },
      (path) => import(`../../../packages/renoun/src/components/${path}.mdx`)
    ),
  },
})

type HookSchema = Record<string, unknown>

export const HooksDirectory = new Directory({
  path: '../../packages/renoun/src/hooks',
  filter: '**/*.{ts,tsx}',
  loader: {
    ts: withSchema<HookSchema>(
      (path) =>
        import(
          /* webpackInclude: /(?:\.examples|\/examples\/).*\.tsx?$/ */
          `../../../packages/renoun/src/hooks/${path}.ts`
        )
    ),
    tsx: withSchema<HookSchema>(
      (path) =>
        import(
          /* webpackInclude: /(?:\.examples|\/examples\/).*\.tsx?$/ */
          `../../../packages/renoun/src/hooks/${path}.tsx`
        )
    ),
    mdx: withSchema(
      {
        metadata: z.object({
          title: z.string(),
          description: z.string(),
        }),
      },
      (path) => import(`../../../packages/renoun/src/hooks/${path}.mdx`)
    ),
  },
})
