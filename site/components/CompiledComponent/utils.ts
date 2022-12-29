import * as React from 'react'
import * as jsxRuntime from 'react/jsx-runtime'
import * as jsxDevRuntime from 'react/jsx-dev-runtime'
import * as mdxReact from '@mdx-js/react'
import * as components from 'components'
import * as styledComponents from 'styled-components'

const dependencies = {
  react: React,
  'react/jsx-runtime': jsxRuntime,
  'react/jsx-dev-runtime': jsxDevRuntime,
  '@mdx-js/react': mdxReact,
  'styled-components': styledComponents,
  components,
}

export function getComponent<ComponentType extends any>(codeString: string) {
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
