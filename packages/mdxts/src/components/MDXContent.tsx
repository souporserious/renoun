import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as jsxDevRuntime from 'react/jsx-dev-runtime'
import { compile } from '@mdx-js/mdx'
import 'server-only'

import type { MDXComponents } from './MDXComponents'
import { Context } from './Context'

/** Compiles and renders MDX content. */
export async function MDXContent({
  value,
  components,
  dependencies,
}: {
  /** The MDX content to render. */
  value: string

  /** Additional components to use or a function that creates them. */
  components?: MDXComponents

  /** An object of external dependencies that will be available to the MDX source code. */
  dependencies?: Record<string, any>
}) {
  const { theme } = arguments[0]
  const allDependencies = {
    jsx: process.env.NODE_ENV === 'development' ? jsxDevRuntime : jsxRuntime,
    ...dependencies,
  } as Record<string, any>
  const code = await compile(value, { outputFormat: 'function-body' })
  const result = new Function(
    ...Object.keys(allDependencies),
    code.value.toString()
  )
  const { default: Component } = result(...Object.values(allDependencies))

  if (Component === null) {
    return null
  }

  if (theme) {
    return (
      <Context value={{ theme }}>
        <Component components={components} />
      </Context>
    )
  }

  return <Component components={components} />
}
