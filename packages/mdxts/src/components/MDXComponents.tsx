import * as React from 'react'
import type { MDXComponents as MDXComponentsType } from 'mdx/types'

import type { Languages } from './CodeBlock/get-tokens'
import type { BaseCodeBlockProps } from './CodeBlock/CodeBlock'
import { CodeBlock } from './CodeBlock/CodeBlock'
import { CodeInline } from './CodeInline'

type MDXTSComponentsType = Omit<MDXComponentsType, 'pre' | 'code'> & {
  pre?: (props: BaseCodeBlockProps & { value: string }) => React.ReactElement
  code?: (props: {
    language: Languages
    children: string
    className?: string
    style?: React.CSSProperties
  }) => React.ReactElement
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
      sourcePath,
      className,
      style,
      value,
    } = props

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
        sourcePath={sourcePath}
      />
    )
  },
  code: ({ language, children, className, style }) => {
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
