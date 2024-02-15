import type { Metadata } from 'next'

const url = 'https://mdxts.dev/'

export function getSiteMetadata({
  title = 'MDXTS - The Content & Documentation SDK for React',
  description = `Build type-safe content and generate documentation using MDX, TypeScript, and React.`,
  keywords = 'react, mdx, typescript, content, documentation, components, design, systems',
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
      siteName: 'MDXTS',
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      site: '@souporserious',
    },
  }
}
