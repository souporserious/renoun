import { DataProvider, Headings, SourceLink } from '@mdxts/react'
import allReact from 'mdxts/react'
import { SiblingNavigation } from 'components/SiblingNavigation'

export async function generateStaticParams() {
  return allReact.map((doc) => ({ slug: doc.slug }))
}

export default function Page({ params }: { params: { slug: string } }) {
  return (
    <DataProvider data={allReact} slug={`react/${params.slug}`}>
      <div style={{ display: 'flex' }}>
        <div>
          <SourceLink />
          <SiblingNavigation />
        </div>
        <Headings />
      </div>
    </DataProvider>
  )
}
