import allDocs from 'mdxts/docs'
import { Content, DataProvider, Outline, SiblingNavigation } from '@mdxts/react'

export async function generateStaticParams() {
  return allDocs.map((doc) => ({ slug: doc.slug }))
}

export default function Page({ params }: { params: { slug: string } }) {
  const doc = allDocs.find((doc) => doc.slug === params.slug)

  return (
    <DataProvider data={allDocs} slug={params.slug}>
      <div style={{ display: 'flex' }}>
        <div>
          <a href={doc.path}>Source</a>
          <Content />
          <SiblingNavigation />
        </div>
        <Outline />
      </div>
    </DataProvider>
  )
}
