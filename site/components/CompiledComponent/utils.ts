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
  const exports: Record<string, unknown> = {}
  const require = (path) => {
    if (dependencies[path]) {
      return dependencies[path]
    }
    throw Error(`Module not found: ${path}.`)
  }
  const result = new Function('exports', 'require', codeString)

  result(exports, require)

  return exports.default as React.ComponentType<ComponentType>
}
