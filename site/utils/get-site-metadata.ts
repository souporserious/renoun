import type { Metadata } from 'next'

const url = 'https://mdxts.dev/'

export function getSiteMetadata({
  title = 'MDXTS - Exceptional content and documentation',
  description = `Build interactive, type-safe content and documentation in MDX, TypeScript, and React.`,
  keywords = 'react, mdx, typescript, content, documentation, components',
}: {
  title?: string
  description?: string
  keywords?: string
} = {}): Metadata {
  return {
    metadataBase: new URL(url),
    title,
    description,
    keywords,
    openGraph: {
      title,
      description,
      url,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      site: '@souporserious',
    },
  }
}
