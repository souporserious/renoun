import { MDXContent as RenounMDXContent } from 'renoun/components'
import { remarkPlugins, rehypePlugins } from 'renoun/mdx'

import { MDXComponents } from '@/components/MDXComponents'

export function MDXContent({ value }: { value: string }) {
  return (
    <RenounMDXContent
      components={MDXComponents as any}
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      value={value}
    />
  )
}
