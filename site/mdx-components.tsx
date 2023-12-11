import * as React from 'react'
import type { MDXComponents } from 'mdx/types'
import { getMetadataFromClassName } from 'mdxts/utils'
import { Code } from 'mdxts/components'
import { Editor } from 'mdxts/components/Editor'
import { Preview } from 'mdxts/components/Preview'
import { PackageExports } from 'mdxts/components/PackageExports'
import { PackageInstall } from 'mdxts/components/PackageInstall'
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
      allowErrors,
      children,
    }: {
      filename?: string
      editable?: boolean
      lineNumbers?: boolean
      showErrors?: boolean
      highlight?: string
      sourcePath?: string
      line?: number
      allowErrors?: boolean
      children: React.ReactElement
    }) => {
      const value = children.props.children.trimStart()
      const metadata = getMetadataFromClassName(children.props.className || '')

      if (editable && allowErrors) {
        throw new Error(
          `mdxts: The [editable] and [allowErrors] props cannot be used together ${
            filename ? `for ${filename}.` : '.'
          }.`
        )
      }

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
          allowErrors={allowErrors}
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
