import * as React from 'react'
import type { MDXComponents } from 'mdx/types'
import { getMetadataFromClassName } from 'mdxts/utils'
import {
  Code,
  Editor,
  Preview,
  PackageExports,
  PackageInstall,
} from 'mdxts/components'
import { GeistMono } from 'geist/font/mono'
import theme from 'theme.json'

export function useMDXComponents() {
  return {
    Preview,
    PackageExports,
    PackageInstall,
    Code: (props) => <Code theme={theme} {...props} />,
    Example: (props) => <div {...props} />,
    Playground: ({ codeBlock, ...props }) => {
      return (
        <div style={{ display: 'flex' }}>
          <Code
            className={GeistMono.className}
            language="tsx"
            theme={theme as any}
            value={codeBlock}
          />
          <div {...props} />
        </div>
      )
    },
    Editor: (props) => <div {...props} />,
    Error: (props) => <div {...props} />,
    Outline: (props) => <div {...props} />,
    References: (props) => <div {...props} />,
    Summary: (props) => <div {...props} />,
    Note: (props) => (
      <div
        style={{
          fontSize: '0.875rem',
          padding: '0.875rem',
          margin: '1rem 0',
          border: '1px solid #333',
          borderRadius: '0.5rem',
          backgroundColor: '#222',
        }}
        {...props}
      />
    ),
    pre: ({
      filename,
      editable,
      lineNumbers,
      showErrors,
      highlight,
      sourcePath,
      line,
      children,
    }: {
      filename?: string
      editable?: boolean
      lineNumbers?: boolean
      showErrors?: boolean
      highlight?: string
      sourcePath?: string
      line?: number
      children: React.ReactElement
    }) => {
      const value = children.props.children.trimStart()
      const metadata = getMetadataFromClassName(children.props.className || '')

      return editable ? (
        <Editor
          defaultValue={value}
          filename={filename}
          language={metadata?.language}
          lineNumbers={lineNumbers}
          highlight={highlight}
          theme={theme as any}
          className={GeistMono.className}
        >
          <Code
            value={value}
            filename={filename}
            language={metadata?.language}
            lineNumbers={lineNumbers}
            highlight={highlight}
            theme={theme as any}
            isNestedInEditor
          />
        </Editor>
      ) : (
        <Code
          filename={filename}
          language={metadata?.language}
          lineNumbers={lineNumbers}
          highlight={highlight}
          value={value}
          theme={theme as any}
          showErrors={showErrors}
          className={GeistMono.className}
          sourcePath={sourcePath}
          line={line}
        />
      )
    },
  } satisfies MDXComponents
}
