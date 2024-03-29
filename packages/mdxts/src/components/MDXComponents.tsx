import * as React from 'react'
import type { MDXComponents as MDXComponentsType } from 'mdx/types'

import { getClassNameMetadata } from '../utils/get-class-name-metadata'
import { CodeBlock } from './CodeBlock'
import { CodeInline } from './CodeInline'

type PrivateCodeBlockProps = {
  /** Path to the source file on disk provided by the remark plugin. */
  sourcePath: string
  sourcePathLine: number
  sourcePathColumn: number
}

type MDXTSComponentsType = Omit<MDXComponentsType, 'pre'> & {
  pre?: (
    props: React.HTMLProps<HTMLPreElement> & {
      allowCopy?: boolean
      allowErrors?: boolean
      filename?: string
      lineNumbers?: boolean
      showErrors?: boolean
      highlight?: string
      toolbar?: boolean
      fontSize?: string
      lineHeight?: string
    } & PrivateCodeBlockProps
  ) => React.ReactElement
}

export type MDXComponents = MDXTSComponentsType

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
      toolbar,
      fontSize,
      lineHeight,
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
        allowCopy={allowCopy}
        allowErrors={allowErrors}
        filename={filename}
        language={metadata?.language}
        lineNumbers={lineNumbers}
        highlight={highlight}
        showErrors={showErrors}
        toolbar={toolbar}
        value={value}
        fontSize={fontSize}
        lineHeight={lineHeight}
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
        paddingHorizontal="0.25rem"
        paddingVertical="0.1rem"
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
