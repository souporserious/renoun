import title from 'title'
import type { ComponentType } from 'react'
import type { Headings } from 'mdxts/rehype'

/** Parses and attaches metadata to a module. */
function parseModule(module, fileName: string) {
  const pathname = fileName
    // Remove file extensions
    .replace(/\.[^/.]+$/, '')
    // Remove leading "./"
    .replace(/^\.\//, '')
    // Remove leading sorting number
    .replace(/\/\d+\./g, '/')
  const slug = pathname.split('/').pop()

  return Object.assign(module, {
    title: module.metadata?.title || module.headings?.[0]?.text || title(slug),
    pathname,
  })
}

/** Loads all imports from a specific directory. */
export function getModules<Type>(context: ReturnType<typeof require.context>) {
  const modules: Record<
    string,
    {
      default: ComponentType
      title: string
      headings?: Headings
      metadata?: { title: string; description: string }
    } & Type
  > = {}

  for (const fileName of context.keys()) {
    if (fileName.startsWith('./')) continue
    const module = parseModule(context(fileName), fileName)
    modules[module.pathname] = module
  }

  return modules
}

export const allDocs = getModules(require.context('./docs', true, /\.mdx$/))
