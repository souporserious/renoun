import { notFound } from 'next/navigation'
import { PageContainer } from 'components/PageContainer'
import { SiblingLinks } from 'components/SiblingLinks'
import { TableOfContents } from 'components/TableOfContents'
import { allDocs } from 'data'
import { getSiteMetadata } from 'utils/get-site-metadata'

export const dynamic = 'force-static'

export function generateStaticParams() {
  return allDocs.paths().map((pathname) => ({ slug: pathname }))
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string[] }
}) {
  const data = await allDocs.get(params.slug)
  return getSiteMetadata({
    title: `${data?.title} - MDXTS`,
    description: data?.description,
  })
}

export default async function Page({ params }: { params: { slug: string[] } }) {
  const doc = await allDocs.get(params.slug)

  if (doc === undefined) {
    return notFound()
  }

  const { Content, title, headings, sourcePath } = doc

  return (
    <PageContainer>
      <div>
        {title ? (
          <h1
            style={{
              // @ts-expect-error
              textWrap: 'balance',
              margin: '0 0 1.4rem',
            }}
          >
            {title}
          </h1>
        ) : null}
        {Content ? <Content /> : null}
        <SiblingLinks previous={doc.previous} next={doc.next} />
      </div>
      <TableOfContents headings={headings} sourcePath={sourcePath} />
    </PageContainer>
  )
}
