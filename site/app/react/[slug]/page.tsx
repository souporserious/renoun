import {
  Content,
  DataProvider,
  Headings,
  References,
  SiblingNavigation,
  SourceLink,
} from '@mdxts/react'
import allReact from 'mdxts/react'

export async function generateStaticParams() {
  return allReact.map((doc) => ({ slug: doc.slug }))
}

export default function Page({ params }: { params: { slug: string } }) {
  return (
    <DataProvider data={allReact} slug={`react/${params.slug}`}>
      <div style={{ display: 'flex' }}>
        <div>
          <SourceLink />
          {/* <Content /> */}
          {/* <References /> */}
          <SiblingNavigation />
        </div>
        <Headings />
      </div>
    </DataProvider>
  )
}
