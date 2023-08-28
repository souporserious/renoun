import title from 'title'
import type { ComponentType } from 'react'
import type { Headings } from './remark'

/** Parses and attaches metadata to a module. */
function parseModule(module, fileName: string) {
  const { default: Component, ...exports } = module
  const pathname = fileName
    // Remove file extensions
    .replace(/\.[^/.]+$/, '')
    // Remove leading "./"
    .replace(/^\.\//, '')
    // Remove leading sorting number
    .replace(/\/\d+\./g, '/')
  const slug = pathname.split('/').pop()

  return {
    Component,
    title: module.metadata?.title || module.headings?.[0]?.text || title(slug),
    pathname,
    ...exports,
  }
}

/** Loads all imports from a specific directory. */
export function getData<Type>(context: ReturnType<typeof require.context>) {
  const modules: Record<
    string,
    {
      Component: ComponentType
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
