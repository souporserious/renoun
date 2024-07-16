import * as React from 'react'
import type { MDXComponents as MDXComponentsType } from 'mdx/types'

import type { BaseCodeBlockProps } from './CodeBlock/CodeBlock'
import { CodeBlock } from './CodeBlock/CodeBlock'
import type { CodeInlineProps } from './CodeInline'
import { CodeInline } from './CodeInline'

type MDXTSComponentsType = Omit<MDXComponentsType, 'pre' | 'code'> & {
  pre?: (props: BaseCodeBlockProps & { value: string }) => React.ReactElement
  code?: (
    props: Omit<CodeInlineProps, 'value'> & { children: string }
  ) => React.ReactElement
}

export type MDXComponents = MDXTSComponentsType

/**
 * Preconfigured MDXTS components for `pre` and `code` elements.
 * @internal
 */
export const MDXComponents = {
  pre: ({
    allowCopy,
    allowErrors,
    showErrors,
    showLineNumbers,
    showToolbar,
    highlightedLines,
    focusedLines,
    unfocusedLinesOpacity,
    filename,
    sourcePath,
    value,
    language,
    className,
    style,
  }) => {
    return (
      <CodeBlock
        allowCopy={allowCopy}
        allowErrors={allowErrors}
        showErrors={showErrors}
        showLineNumbers={showLineNumbers}
        showToolbar={showToolbar}
        highlightedLines={highlightedLines}
        focusedLines={focusedLines}
        unfocusedLinesOpacity={unfocusedLinesOpacity}
        filename={filename}
        sourcePath={sourcePath}
        value={value}
        language={language}
        className={className}
        style={style}
      />
    )
  },
  code: ({ language, children, paddingX, paddingY, className, style }) => {
    return (
      <CodeInline
        value={children}
        language={language}
        paddingX={paddingX}
        paddingY={paddingY}
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
