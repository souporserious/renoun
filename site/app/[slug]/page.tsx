import {
  Content,
  DataProvider,
  Headings,
  SiblingNavigation,
  SourceLink,
} from '@mdxts/react'
import allDocs from 'mdxts/docs'

export async function generateStaticParams() {
  return allDocs.map((doc) => ({ slug: doc.slug }))
}

export default function Page({ params }: { params: { slug: string } }) {
  return (
    <DataProvider data={allDocs} slug={params.slug}>
      <div style={{ display: 'flex' }}>
        <div>
          <SourceLink />
          <Content />
          <SiblingNavigation />
        </div>
        <Headings />
      </div>
    </DataProvider>
  )
}
