import allDocs from 'mdxts/docs'
import { DataProvider, Outline, SiblingNavigation } from '@mdxts/react'
// import { Content } from './content'

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
          {/* <Content /> */}
          <SiblingNavigation />
        </div>
        <Outline />
      </div>
    </DataProvider>
  )
}
