import { CodeBlock, parsePreProps } from 'renoun/components'
import type { MDXComponents } from 'renoun/mdx'
import { Accordion } from '@/ui/Accordion'

export function useMDXComponents() {
  return {
    Accordion: (props) => {
      return <Accordion {...props} />
    },
    pre: (props) => {
      console.log(props)
      return <CodeBlock {...parsePreProps(props)} />
    },
  } satisfies MDXComponents
}
