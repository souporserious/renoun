import { CodeBlock, type MDXComponents } from 'renoun'

import { Accordion } from '@/ui/Accordion'
import { Card } from '@/ui/Card'

export function useMDXComponents() {
  return {
    Accordion,
    Card,
    CodeBlock,
  } satisfies MDXComponents
}
