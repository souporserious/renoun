import * as React from 'react'

import type { MDXComponents as MDXComponentsType } from '../mdx/index.js'
import type { BaseCodeBlockProps } from './CodeBlock/CodeBlock.js'
import { CodeBlock } from './CodeBlock/CodeBlock.js'
import type { CodeInlineProps } from './CodeInline.js'
import { CodeInline } from './CodeInline.js'

type RenounComponentsType = Omit<MDXComponentsType, 'pre' | 'code'> & {
  pre?: (props: BaseCodeBlockProps & { value: string }) => React.ReactElement
  code?: (
    props: Omit<CodeInlineProps, 'value'> & { children: string }
  ) => React.ReactElement
}

export type MDXComponents = RenounComponentsType

/** Preconfigured Renoun components for `pre` and `code` elements. */
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
} satisfies RenounComponentsType

export function useMDXComponents(
  components: RenounComponentsType
): RenounComponentsType {
  return {
    ...MDXComponents,
    ...components,
  }
}
