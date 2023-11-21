import React from 'react'
import title from 'title'
import type { ComponentType } from 'react'
import type { CodeBlocks, Headings } from './remark'
import { MdxtsProvider } from './context'

export * from './context'

export type Module = {
  Component: ComponentType
  title: string
  pathname: string
  slug: string
  headings: Headings
  codeBlocks: CodeBlocks
  summary: string
  metadata?: { title: string; description: string }
}

/** Parses and attaches metadata to a module. */
function parseModule(module, filename: string) {
  const { default: Component, codeBlocks, ...exports } = module
  const pathname = filename
    // Remove file extensions
    .replace(/\.[^/.]+$/, '')
    // Remove leading "./"
    .replace(/^\.\//, '')
    // Remove leading sorting number
    .replace(/\/\d+\./g, '/')
  const slug = pathname.split('/').pop()

  return {
    // Component: (props) => (
    //   <MdxtsProvider value={{ codeBlocks }}>
    //     <Component {...props} />
    //   </MdxtsProvider>
    // ),
    Component,
    title: module.metadata?.title || module.headings?.[0]?.text || title(slug),
    pathname,
    slug,
    ...exports,
  }
}

/** Loads all imports and parses metadata for a specific directory. */
export function getData<Type>(allModules: Record<string, Type>) {
  return Object.fromEntries(
    Object.entries(allModules).map(([key, module]) => {
      const parsedModule = parseModule(module, key)
      return [parsedModule.pathname, parsedModule]
    })
  ) as Record<string, Module>
}
