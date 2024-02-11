import * as React from 'react'
import type { MDXComponents as MDXComponentsType } from 'mdx/types'

import { Code, getClassNameMetadata } from './Code'

/** Pre-configured MDXTS components for `pre` and `code` elements. */
export const MDXComponents = {
  pre: (props) => {
    const {
      filename,
      lineNumbers,
      showErrors,
      highlight,
      sourcePath,
      sourcePathLine,
      sourcePathColumn,
      allowErrors,
      children,
      className,
      style,
    } = props as {
      filename?: string
      lineNumbers?: boolean
      showErrors?: boolean
      highlight?: string
      sourcePath?: string
      sourcePathLine?: number
      sourcePathColumn?: number
      allowErrors?: boolean
      children: React.ReactElement
      className: string
      style: React.CSSProperties
    }
    const value = children.props.children.trimStart()
    const metadata = getClassNameMetadata(children.props.className || '')

    return (
      <Code
        allowErrors={allowErrors}
        filename={filename}
        language={metadata?.language}
        lineNumbers={lineNumbers}
        highlight={highlight}
        value={value}
        showErrors={showErrors}
        className={className}
        style={style}
        // @ts-expect-error - private props
        sourcePath={sourcePath}
        sourcePathLine={sourcePathLine}
        sourcePathColumn={sourcePathColumn}
      />
    )
  },
  code: ({ children, className, style }) => {
    if (typeof children !== 'string') {
      return <code className={className} style={style} children={children} />
    }

    return (
      <Code
        inline
        paddingHorizontal="0.25rem"
        paddingVertical="0.1rem"
        value={children}
        className={className}
        style={style}
      />
    )
  },
} satisfies MDXComponentsType

export type MDXComponents = MDXComponentsType

export function useMDXComponents(): MDXComponentsType {
  return MDXComponents
}
