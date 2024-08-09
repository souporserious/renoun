/* This file was automatically generated by the `mdxts` package. */
import { createCollection } from 'mdxts/collections'

createCollection.setImportMap(
  'ts:@/components/**/{index,*.examples}.{ts,tsx}',
  (slug) => import(`@/components/${slug}.ts`),
  'tsx:@/components/**/{index,*.examples}.{ts,tsx}',
  (slug) => import(`@/components/${slug}.tsx`),
  'mdx:@/posts/**/*.{ts,mdx}',
  (slug) => import(`@/posts/${slug}.mdx`),
  'ts:@/posts/**/*.{ts,mdx}',
  (slug) => import(`@/posts/${slug}.ts`)
)

export * from 'mdxts/collections'
