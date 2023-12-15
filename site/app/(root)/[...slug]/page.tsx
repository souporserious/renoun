import { notFound } from 'next/navigation'
import { SiblingLinks } from 'components/SiblingLinks'
import { TableOfContents } from 'components/TableOfContents'
import { allDocs } from 'data'

export const dynamic = 'force-static'

export function generateStaticParams() {
  return allDocs.paths().map((pathname) => ({ slug: pathname }))
}

export default async function Page({ params }: { params: { slug: string[] } }) {
  const doc = await allDocs.get(params.slug)

  if (doc === null) {
    return notFound()
  }

  const { Content, headings, sourcePath } = doc

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 140px',
        gap: '2rem',
      }}
    >
      <div>
        {Content ? <Content /> : null}
        <SiblingLinks previous={doc.previous} next={doc.next} />
      </div>
      <TableOfContents headings={headings} sourcePath={sourcePath} />
    </div>
  )
}
