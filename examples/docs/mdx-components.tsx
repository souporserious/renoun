import { CodeBlock } from 'renoun/components'
import type { MDXComponents } from 'renoun/mdx'

import { Accordion } from '@/ui/Accordion'
import { Card } from '@/ui/Card'

export function useMDXComponents() {
  return {
    Accordion,
    Card,
    CodeBlock,
  } satisfies MDXComponents
}
