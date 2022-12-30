import { CompiledComponent } from 'components/CompiledComponent'
import allDocs from 'mdxts/docs'
import { DataProvider, Outline, SiblingNavigation } from 'mdxts/components'

export async function generateStaticParams() {
  return allDocs.map((doc) => ({ slug: doc.slug }))
}

export default function Page({ params }: { params: { slug: string } }) {
  const doc = allDocs.find((doc) => doc.slug === params.slug)

  return (
    <DataProvider allData={allDocs} activeSlug={params.slug}>
      <div style={{ display: 'flex' }}>
        <div>
          <a href={doc.path}>Source</a>
          <CompiledComponent codeString={doc.mdx.code} />
          <SiblingNavigation />
        </div>
        <Outline />
      </div>
    </DataProvider>
  )
}
