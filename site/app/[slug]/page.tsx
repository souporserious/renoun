import { Content, DataProvider, Headings, SourceLink } from '@mdxts/react'
import allDocs from 'mdxts/docs'
import { SiblingNavigation } from 'components/SiblingNavigation'

export async function generateStaticParams() {
  return allDocs.map((doc) => ({ slug: doc.slug }))
}

export default function Page({ params }: { params: { slug: string } }) {
  return (
    <DataProvider data={allDocs} slug={params.slug}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px' }}>
        <div style={{ minWidth: 0, minHeight: '100vh' }}>
          <Content />
          <SourceLink />
          <SiblingNavigation />
        </div>
        <Headings />
      </div>
    </DataProvider>
  )
}
