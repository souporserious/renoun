import allReact from 'mdxts/react'
import { SiblingNavigation } from 'components/SiblingNavigation'

export async function generateStaticParams() {
  return allReact.map((doc) => ({ slug: doc.slug }))
}

export default function Page({ params }: { params: { slug: string } }) {
  return (
    <div style={{ display: 'flex' }}>
      <div>
        {/* <SourceLink /> */}
        {/* <SiblingNavigation /> */}
      </div>
      {/* <Headings /> */}
    </div>
  )
}
