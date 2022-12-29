import { CompiledComponent } from 'components'
import allDocs from 'mdxts/docs'
import { SiblingNavigation } from './navigation'

export async function generateStaticParams() {
  return allDocs.map((doc) => ({ slug: doc.slug }))
}

export default function Page({ params }: { params: { slug: string } }) {
  const doc = allDocs.find((doc) => doc.slug === params.slug)

  return (
    <>
      <a href={doc.path}>Source</a>
      <CompiledComponent codeString={JSON.parse(doc.mdx)} />
      <SiblingNavigation activeSlug={params.slug} />
    </>
  )
}
