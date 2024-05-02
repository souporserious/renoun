import * as React from 'react'
import type { MDXComponents as MDXComponentsType } from 'mdx/types'

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
    props: BaseCodeBlockProps & PrivateCodeBlockProps & { value: string }
  ) => React.ReactElement
}

export type MDXComponents = MDXTSComponentsType

/** Preconfigured MDXTS components for `pre` and `code` elements. */
export const MDXComponents = {
  pre: (props) => {
    const {
      allowCopy,
      allowErrors,
      showErrors,
      lineNumbers,
      lineHighlights,
      toolbar,
      filename,
      language,
      className,
      style,
      value,
    } = props
    const { sourcePath, sourcePathLine, sourcePathColumn } =
      props as unknown as PrivateCodeBlockProps

    return (
      <CodeBlock
        allowCopy={allowCopy}
        allowErrors={allowErrors}
        showErrors={showErrors}
        lineNumbers={lineNumbers}
        lineHighlights={lineHighlights}
        toolbar={toolbar}
        filename={filename}
        language={language}
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
  code: ({ language, value, className, style }) => {
    return (
      <CodeInline
        language={language}
        value={value}
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
