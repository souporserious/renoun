import title from 'title'
import type { ComponentType } from 'react'
import type { Headings } from './remark'

export type Module = {
  Component: ComponentType
  title: string
  headings?: Headings
  metadata?: { title: string; description: string }
}

/** Parses and attaches metadata to a module. */
function parseModule(module, filename: string) {
  const { default: Component, ...exports } = module
  const pathname = filename
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

/** Loads all imports and parses metadata for a specific directory. */
export function getData<Type>(context: ReturnType<typeof require.context>) {
  const modules: Record<string, Module & Type> = {}

  for (const filename of context.keys()) {
    if (filename.startsWith('./')) continue
    const module = parseModule(context(filename), filename)
    modules[module.pathname] = module
  }

  return modules
}
