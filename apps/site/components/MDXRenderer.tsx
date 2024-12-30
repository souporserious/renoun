import { MDXRenderer as BaseMDXRenderer } from 'renoun/components'
import { remarkPlugins, rehypePlugins } from 'renoun/mdx'

import { MDXComponents } from '@/components/MDXComponents'

export function MDXRenderer({ value }: { value: string }) {
  return (
    <BaseMDXRenderer
      components={MDXComponents as any}
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      value={value}
    />
  )
}
