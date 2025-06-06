import { CodeBlock, parsePreProps } from 'renoun/components'
import type { MDXComponents } from 'renoun/mdx'
import { Accordion } from '@/ui/Accordion'
import { Card } from '@/ui/Card'

export function useMDXComponents() {
  return {
    Accordion: (props) => {
      return <Accordion {...props} />
    },
    Card: (props) => {
      return <Card {...props} />
    },
    pre: (props) => {
      console.log(props)
      return <CodeBlock {...parsePreProps(props)} />
    },
  } satisfies MDXComponents
}
