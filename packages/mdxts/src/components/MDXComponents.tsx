import * as React from 'react'
import type { MDXComponents as MDXComponentsType } from 'mdx/types'

import { getClassNameMetadata } from '../utils/get-class-name-metadata'
import type { BaseCodeBlockProps } from './CodeBlock/CodeBlock'
import { CodeBlock } from './CodeBlock/CodeBlock'
import { CodeInline } from './CodeInline'

type PrivateCodeBlockProps = {
  /** Path to the source file on disk provided by the remark plugin. */
  sourcePath: string
  sourcePathLine: number
  sourcePathColumn: number
}

type MDXTSComponentsType = Omit<MDXComponentsType, 'pre'> & {
  pre?: (
    props: React.HTMLProps<HTMLPreElement> &
      BaseCodeBlockProps &
      PrivateCodeBlockProps
  ) => React.ReactElement
}

export type MDXComponents = MDXTSComponentsType

/** Pre-configured MDXTS components for `pre` and `code` elements. */
export const MDXComponents = {
  pre: (props) => {
    const {
      // allowCopy,
      // lineNumbers,
      // highlight,
      // toolbar,
      allowErrors,
      filename,
      showErrors,
      className,
      style,
      children,
    } = props
    const { sourcePath, sourcePathLine, sourcePathColumn } =
      props as unknown as PrivateCodeBlockProps

    if (!React.isValidElement(children) || !children.props.children) {
      throw new Error(
        'mdxts: Expected children to be defined for MDX `pre` element.'
      )
    }

    const value = children.props.children.trimStart()
    const metadata = getClassNameMetadata(children.props.className || '')

    return (
      <CodeBlock
        // allowCopy={allowCopy}
        // lineNumbers={lineNumbers}
        // highlight={highlight}
        // toolbar={toolbar}
        allowErrors={allowErrors}
        filename={filename}
        language={metadata?.language}
        showErrors={showErrors}
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
  code: ({ language, children, className, style }) => {
    if (typeof children !== 'string') {
      throw new Error(
        'mdxts: Expected children to be a string for MDX `code` element.'
      )
    }

    return (
      <CodeInline
        language={language}
        value={children}
        className={className}
        style={style}
      />
    )
  },
} satisfies MDXTSComponentsType

export function useMDXComponents(
  components: MDXTSComponentsType
): MDXTSComponentsType {
  return {
    ...MDXComponents,
    ...components,
  }
}
