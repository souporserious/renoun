import { MDXRenderer as BaseMDXRenderer } from 'renoun/components'
import { remarkPlugins, rehypePlugins } from 'renoun/mdx'

import { MDXComponents } from '@/components/MDXComponents'

export function MDXRenderer({ children }: { children: string }) {
  return (
    <BaseMDXRenderer
      components={MDXComponents}
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      children={children}
    />
  )
}
