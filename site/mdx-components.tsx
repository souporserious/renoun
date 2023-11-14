import * as React from 'react'
import type { MDXComponents } from 'mdx/types'
import { getMetadataFromClassName } from 'mdxts/utils'
import { Code, Editor } from 'mdxts/components'
import theme from './theme.json'

export function useMDXComponents() {
  return {
    Code: (props) => <Code theme={theme} {...props} />,
    Example: (props) => <div {...props} />,
    Playground: ({ codeBlock, ...props }) => {
      return (
        <div style={{ display: 'flex' }}>
          <Code language="tsx" theme={theme as any} value={codeBlock} />
          <div {...props} />
        </div>
      )
    },
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
      highlight,
      children,
    }: {
      filename?: string
      editable?: boolean
      lineNumbers?: boolean
      highlight?: string
      children: React.ReactElement
    }) => {
      const value = children.props.children.trimStart()
      const metadata = getMetadataFromClassName(children.props.className || '')

      return editable ? (
        <Editor
          filename={filename}
          language={metadata?.language}
          lineNumbers={lineNumbers}
          highlight={highlight}
          defaultValue={value}
          theme={theme as any}
        />
      ) : (
        <Code
          filename={filename}
          language={metadata?.language}
          lineNumbers={lineNumbers}
          highlight={highlight}
          value={value}
          theme={theme as any}
        />
      )
    },
  } satisfies MDXComponents
}
