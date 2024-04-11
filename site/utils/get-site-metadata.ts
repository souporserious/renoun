import type { Metadata } from 'next'

const url = 'https://mdxts.dev/'

export function getSiteMetadata({
  title = 'MDXTS - The Content & Documentation SDK for React',
  description = `Build type-safe content and generate documentation using MDX, TypeScript, and React.`,
  keywords = 'react, mdx, typescript, content, documentation, components, design, systems',
  ...rest
}: { title?: string; description?: string } & Omit<
  Metadata,
  'title' | 'description'
> = {}) {
  return {
    metadataBase: new URL(url),
    title,
    description,
    keywords,
    ...rest,
    openGraph: {
      title: title!,
      description: description!,
      url,
      siteName: 'MDXTS',
      locale: 'en_US',
      type: 'website',
      ...rest.openGraph,
    },
    twitter: {
      card: 'summary_large_image',
      site: '@souporserious',
      ...rest.twitter,
    },
  } satisfies Metadata
}
