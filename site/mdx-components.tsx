import * as React from 'react'
import type { MDXComponents } from 'mdx/types'
import { getMetadataFromClassName } from 'mdxts/utils'
import { Code, Editor } from 'mdxts/components'
// import { Editor } from './editor'
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
      filename,
      editable,
      lineNumbers,
      children,
    }: {
      filename?: string
      editable?: boolean
      lineNumbers?: boolean
      children: React.ReactElement
    }) => {
      const value = children.props.children.trim()
      const metadata = getMetadataFromClassName(children.props.className || '')

      return editable ? (
        <Editor
          filename={filename}
          language={metadata?.language}
          lineNumbers={lineNumbers}
          defaultValue={value.trim()}
          theme={theme as any}
        />
      ) : (
        <Code
          filename={filename}
          language={metadata?.language}
          lineNumbers={lineNumbers}
          value={value.trim()}
          theme={theme as any}
        />
      )
    },
  } satisfies MDXComponents
}
