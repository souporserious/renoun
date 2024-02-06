import * as React from 'react'
import type { MDXComponents } from 'mdx/types'
import { Code, getClassNameMetadata } from 'mdxts/components/Code'
import { Editor } from 'mdxts/components/Editor'
import { Preview } from 'mdxts/components/Preview'
import { PackageInstall } from 'mdxts/components/PackageInstall'
import { GeistMono } from 'geist/font/mono'

export function useMDXComponents() {
  return {
    Preview,
    PackageInstall,
    Code,
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
    Note: ({ children, ...props }) => (
      <div
        style={{
          fontSize: 'var(--font-size-body-2)',
          lineHeight: 'var(--line-height-body-2)',
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          padding: '1em',
          margin: '1rem -1rem',
          gap: '0.75rem',
          border: '1px solid var(--color-separator)',
          borderRadius: '0.5rem',
          backgroundColor: 'var(--color-surface-2)',
        }}
        {...props}
      >
        <svg
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          width="1rem"
          height="1rem"
          viewBox="0 0 24 24"
          style={{ marginTop: '0.25rem', opacity: 0.6 }}
        >
          <path d="M7.06883 21.6H16.219C18.7973 21.6 20.8879 19.5093 20.8879 16.9312V5.86885C20.8879 3.29074 18.7973 1.20001 16.219 1.20001H7.06883C4.49072 1.20001 2.39999 3.29074 2.39999 5.86885V16.9312C2.39999 19.5093 4.49072 21.6 7.06883 21.6Z" />
          <path d="M15.3946 15.842H7.89178M15.3946 11.245H7.89178M10.755 6.6586H7.89232" />
        </svg>
        <div>{children}</div>
      </div>
    ),
    ul: (props) => (
      <ul
        style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '0 0 0 1.4rem',
          gap: '1rem',
          fontSize: 'var(--font-size-body-2)',
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
      const metadata = getClassNameMetadata(children.props.className || '')

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
          style={{ width: 'calc(100% + 2rem)', margin: '0 -1rem 1.6rem' }}
          // @ts-expect-error - private props
          sourcePath={sourcePath}
          sourcePathLine={sourcePathLine}
          sourcePathColumn={sourcePathColumn}
        />
      )
    },
    code: (props) => {
      if (typeof props.children !== 'string') {
        return <code {...props} />
      }

      return (
        <Code
          inline
          paddingHorizontal="0.25rem"
          paddingVertical="0.1rem"
          value={props.children}
          className={GeistMono.className}
        />
      )
    },
  } satisfies MDXComponents
}
