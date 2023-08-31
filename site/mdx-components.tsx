import * as React from 'react'
import type { MDXComponents } from 'mdx/types'
import { Code } from 'mdxts/components'
import { getLanguageFromClassName } from 'mdxts/utils'

import theme from './theme.json'

export function useMDXComponents(): MDXComponents {
  return {
    Example: (props) => <div {...props} />,
    Summary: (props) => <div {...props} />,
    pre: (props) => {
      const { children, className } = (props.children as any).props
      const language = getLanguageFromClassName(className)
      return <Code language={language} value={children} theme={theme} />
    },
  } satisfies MDXComponents
}
