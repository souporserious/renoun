import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as jsxDevRuntime from 'react/jsx-dev-runtime'
import * as mdxReact from '@mdx-js/react'
import { DataProviderContext } from './DataProvider'

/**
 * Execute a string of code and return the default export.
 * Supports TypeScript and JSX syntax.
 *
 * @example
 *
 * import { DataProvider, Content } from 'mdxts/components'
 * import allDocs from 'mdxts/docs'
 *
 * export default function Example() {
 *   return (
 *     <DataProvider allData={allDocs} activeSlug={}>
 *       <Content codeString={codeString} />
 *     </DataProvider>
 *   )
 * }
 */
export function Content() {
  const { dataItem } = React.useContext(DataProviderContext)

  if (!dataItem?.mdx?.code) {
    return null
  }

  // @ts-expect-error
  const element = React.use(getComponent(dataItem.mdx.code as string))

  return React.createElement(element)
}

export async function getComponent<ComponentType extends any>(
  codeString: string
) {
  const dependencies = {
    react: React,
    'react/jsx-runtime': jsxRuntime,
    'react/jsx-dev-runtime': jsxDevRuntime,
    '@mdx-js/react': mdxReact,
  }
  const functionModule: {
    exports: { default: React.ComponentType<ComponentType> | null }
  } = { exports: { default: null } }
  const functionRequire = (path) => {
    if (dependencies[path]) {
      return dependencies[path]
    }
    throw Error(`Module not found: ${path}.`)
  }
  const result = new Function('module', 'require', codeString)

  result(functionModule, functionRequire)

  return functionModule.exports.default
}
