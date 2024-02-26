import * as React from 'react'
import type { MDXComponents as MDXComponentsType } from 'mdx/types'

import { getClassNameMetadata } from '../utils/get-class-name-metadata'
import { CodeBlock } from './CodeBlock'
import { CodeInline } from './CodeInline'

/** Pre-configured MDXTS components for `pre` and `code` elements. */
export const MDXComponents = {
  pre: (props) => {
    const {
      allowCopy,
      allowErrors,
      filename,
      lineNumbers,
      showErrors,
      highlight,
      sourcePath,
      sourcePathLine,
      sourcePathColumn,
      toolbar,
      children,
      className,
      style,
    } = props as {
      allowCopy?: boolean
      allowErrors?: boolean
      filename?: string
      lineNumbers?: boolean
      showErrors?: boolean
      highlight?: string
      sourcePath?: string
      sourcePathLine?: number
      sourcePathColumn?: number
      toolbar?: boolean
      children: React.ReactElement
      className: string
      style: React.CSSProperties
    }
    const value = children.props.children.trimStart()
    const metadata = getClassNameMetadata(children.props.className || '')

    return (
      <CodeBlock
        allowCopy={allowCopy}
        allowErrors={allowErrors}
        filename={filename}
        language={metadata?.language}
        lineNumbers={lineNumbers}
        highlight={highlight}
        showErrors={showErrors}
        toolbar={toolbar}
        value={value}
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
      <CodeInline
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

export function useMDXComponents(
  components: MDXComponentsType
): MDXComponentsType {
  return {
    ...MDXComponents,
    ...components,
  }
}
