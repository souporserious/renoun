import {
  CodeBlock,
  CodeInline,
  parsePreProps,
  parseCodeProps,
} from 'renoun/components'
import type { MDXComponents } from 'renoun/mdx'
import { Accordion } from '@/ui/Accordion'

export function useMDXComponents() {
  return {
    Accordion: (props) => {
      return <Accordion {...props} />
    },
    pre: (props) => {
      return <CodeBlock {...parsePreProps(props)} />
    },
    code: (props) => {
      return <CodeInline {...parseCodeProps(props)} />
    },
  } satisfies MDXComponents
}
