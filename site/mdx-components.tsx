import * as React from 'react'
import type { MDXComponents } from 'mdx/types'
import { Code } from 'mdxts/components'

const languages = {
  mjs: 'javascript',
}

function getLanguageFromClassName(className: string = '') {
  const language = className
    .split(' ')
    .find((name) => name.startsWith('language-'))
    ?.slice(9)

  return language ? languages[language] ?? language : null
}

export function useMDXComponents(): MDXComponents {
  return {
    Example: (props) => <div {...props} />,
    Summary: (props) => <div {...props} />,
    code: ({ children, className }) => {
      const language = getLanguageFromClassName(className)
      return (
        // @ts-expect-error
        <Code language={language} value={children as string} />
      )
    },
  } satisfies MDXComponents
}
