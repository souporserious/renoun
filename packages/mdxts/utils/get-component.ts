import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as jsxDevRuntime from 'react/jsx-dev-runtime'

/**
 * Execute a string of code and return the default export.
 * Supports TypeScript and JSX syntax.
 *
 * @example
 *
 * import { Content } from 'mdxts/components'
 * import allDocs from 'mdxts/docs'
 *
 * export default function Page({ params }: { params: { slug: string } }) {
 *   const doc = allDocs.find((doc) => doc.slug === params.slug)
 *   const Component = await getComponent(doc.mdx.code)
 *   return <Component />
 * }
 */
export async function getComponent<ComponentType extends any>(
  /** The code to execute. */
  code: string,

  /** An object of external dependencies that will be available to the code. */
  dependencies: Record<string, any> = {}
) {
  const allDependencies = {
    react: React,
    'react/jsx-runtime': jsxRuntime,
    'react/jsx-dev-runtime': jsxDevRuntime,
    ...dependencies,
  }
  const functionExports = { default: null }
  const functionModule: {
    exports: { default: React.ComponentType<ComponentType> | null }
  } = { exports: functionExports }
  const functionRequire = (path) => {
    if (allDependencies[path]) {
      return allDependencies[path]
    }
    throw Error(`Module not found: ${path}.`)
  }
  const result = new Function('module', 'exports', 'require', code)

  result(functionModule, functionExports, functionRequire)

  return functionModule.exports
}
