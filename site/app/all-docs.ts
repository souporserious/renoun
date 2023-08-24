import type { ComponentType } from 'react'
import type { Headings } from 'mdxts/rehype'

/** Loads all imports from a specific directory. */
export function getModules<Type>(context: ReturnType<typeof require.context>) {
  const modules: Record<string, Type> = {}

  for (const fileName of context.keys()) {
    if (fileName.startsWith('./')) continue

    const slug = fileName
      // Remove file extensions
      .replace(/\.[^/.]+$/, '')
      // Remove leading "./"
      .replace(/^\.\//, '')
      // Remove leading sorting number
      .replace(/\/\d+\./g, '/')

    modules[slug] = context(fileName)
  }

  return modules
}

export const allDocs = getModules<{
  default: ComponentType
  headings?: Headings
  metadata?: { title: string; description: string }
}>(require.context('../docs', true, /\.mdx$/))
