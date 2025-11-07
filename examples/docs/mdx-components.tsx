import { CodeBlock, type MDXComponents } from 'renoun'

import { Accordion } from '@/ui/Accordion'
import { Card } from '@/ui/Card'

export function useMDXComponents() {
  return {
    Accordion,
    Card,
    CodeBlock,
    Heading: ({ Tag, id, children, ...rest }) => (
      <Tag id={id} {...rest}>
        <a href={`#${id}`} className="not-prose">
          {children}
        </a>
      </Tag>
    ),
  } satisfies MDXComponents
}
