import { Directory, withSchema, type Headings } from 'renoun'
import { z } from 'zod'

export const FileSystemDirectory = new Directory({
  path: '../../packages/renoun/src/file-system',
  basePathname: 'utilities',
  loader: {
    mdx: withSchema<{
      headings: Headings
    }>(
      (path) => import(`../../../packages/renoun/src/file-system/${path}.mdx`)
    ),
  },
})

type ComponentSchema = Record<string, React.ComponentType>

export const ComponentsDirectory = new Directory({
  path: '../../packages/renoun/src/components',
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
        headings: z.array(
          z.object({
            id: z.string(),
            level: z.number(),
            children: z.custom<NonNullable<React.ReactNode>>(),
            text: z.string(),
          })
        ),
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
        headings: z.array(
          z.object({
            id: z.string(),
            level: z.number(),
            children: z.custom<NonNullable<React.ReactNode>>(),
            text: z.string(),
          })
        ),
        metadata: z.object({
          title: z.string(),
          description: z.string(),
        }),
      },
      (path) => import(`../../../packages/renoun/src/hooks/${path}.mdx`)
    ),
  },
})
