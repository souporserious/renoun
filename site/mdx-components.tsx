import * as React from 'react'
import type { MDXComponents } from 'mdx/types'
import { Code } from 'mdxts/components'
import { getMetadataFromClassName } from 'mdxts/utils'

import theme from './theme.json'

export function useMDXComponents() {
  return {
    Example: (props) => <div {...props} />,
    Editor: (props) => <div {...props} />,
    Preview: (props) => <div {...props} />,
    Error: (props) => <div {...props} />,
    Outline: (props) => <div {...props} />,
    References: (props) => <div {...props} />,
    Summary: (props) => <div {...props} />,
    pre: (props) => {
      const { children: value, className = '' } = (props.children as any).props
      const metadata = getMetadataFromClassName(className)
      return (
        <Code
          language={metadata?.language}
          value={value.trim()}
          theme={theme}
        />
      )
    },
  } satisfies MDXComponents
}
