import * as React from 'react'
import type { MDXComponents } from 'mdx/types'
import { getMetadataFromClassName } from 'mdxts/utils'
import { Code } from 'mdxts/components/server'
import { Editor } from './editor'
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
    Note: (props) => <div {...props} />,
    pre: ({
      live,
      children,
    }: {
      live?: boolean
      children: React.ReactElement
    }) => {
      const value = children.props.children.trim()
      const metadata = getMetadataFromClassName(children.props.className || '')

      return live ? (
        <Editor
          defaultValue={value.trim()}
          language={metadata?.language}
          theme={theme as any}
        />
      ) : (
        <Code
          language={metadata?.language}
          value={value.trim()}
          theme={theme as any}
        />
      )
    },
  } satisfies MDXComponents
}
