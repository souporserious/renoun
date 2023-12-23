import * as React from 'react'
import type { MDXComponents } from 'mdx/types'
import { Code, getMetadataFromClassName } from 'mdxts/components/Code'
import { Editor } from 'mdxts/components/Editor'
import { Preview } from 'mdxts/components/Preview'
import { PackageExports } from 'mdxts/components/PackageExports'
import { PackageInstall } from 'mdxts/components/PackageInstall'
import { GeistMono } from 'geist/font/mono'

export function useMDXComponents() {
  return {
    Preview,
    PackageExports,
    PackageInstall,
    Code: (props) => <Code {...props} />,
    Example: (props) => <div {...props} />,
    Playground: ({ codeBlock, ...props }) => {
      return (
        <div style={{ display: 'flex' }}>
          <Code
            className={GeistMono.className}
            language="tsx"
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
    pre: (props) => {
      const {
        filename,
        editable,
        lineNumbers,
        showErrors,
        highlight,
        sourcePath,
        sourcePathLine,
        sourcePathColumn,
        allowErrors,
        children,
      } = props as {
        filename?: string
        editable?: boolean
        lineNumbers?: boolean
        showErrors?: boolean
        highlight?: string
        sourcePath?: string
        sourcePathLine?: number
        sourcePathColumn?: number
        allowErrors?: boolean
        children: React.ReactElement
      }
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
          className={GeistMono.className}
        >
          <Code
            value={value}
            filename={filename}
            language={metadata?.language}
            lineNumbers={lineNumbers}
            highlight={highlight}
            // @ts-expect-error - private prop
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
          showErrors={showErrors}
          className={GeistMono.className}
          // @ts-expect-error - private props
          sourcePath={sourcePath}
          sourcePathLine={sourcePathLine}
          sourcePathColumn={sourcePathColumn}
        />
      )
    },
  } satisfies MDXComponents
}
