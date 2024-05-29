import { GitProviderLink } from 'mdxts/components'
import { allPosts } from '@/data'

export function generateStaticParams() {
  return allPosts.paths().map((pathname) => ({ slug: pathname }))
}

export default async function Page({ params }: { params: { slug: string } }) {
  const { Content, frontMatter } = (await allPosts.get(params.slug))!
  return (
    <>
      <h1>{frontMatter.title}</h1>
      <GitProviderLink />
      <Content />
    </>
  )
}
