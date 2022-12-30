import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as jsxDevRuntime from 'react/jsx-dev-runtime'

/**
 * Execute a string of code and return the default export.
 * Supports TypeScript and JSX syntax.
 *
 * @example
 *
 * import { CompiledComponent } from 'components'
 *
 * export default function Example() {
 *   const codeString = `exports.default = () => require('react').createElement('div', null, 'Hello World')`
 *   return <CompiledComponent codeString={codeString} />
 * }
 */
export function CompiledComponent({ codeString }: { codeString: string }) {
  const element = React.use(getComponent(codeString))

  return codeString ? React.createElement(element) : null
}

export async function getComponent<ComponentType extends any>(
  codeString: string
) {
  const mdxReact = await import('@mdx-js/react')
  const dependencies = {
    react: React,
    'react/jsx-runtime': jsxRuntime,
    'react/jsx-dev-runtime': jsxDevRuntime,
    '@mdx-js/react': mdxReact,
  }
  const functionModule = { exports: { default: null } }
  const functionRequire = (path) => {
    if (dependencies[path]) {
      return dependencies[path]
    }
    throw Error(`Module not found: ${path}.`)
  }
  const result = new Function('module', 'require', codeString)

  result(functionModule, functionRequire)

  return functionModule.exports.default as React.ComponentType<ComponentType>
}
