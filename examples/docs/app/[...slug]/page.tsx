import { docs } from '@/collections'

export async function generateStaticParams() {
  const entries = await docs.getEntries({ recursive: true })

  return entries.map((entry) => ({
    slug: entry.getPathSegments({ includeBasePath: false }),
  }))
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const doc = await docs.getFile(slug, 'mdx')
  const [metadata, Content, updatedAt] = await Promise.all([
    doc.getExportValue('metadata'),
    doc.getExportValue('default'),
    doc.getLastCommitDate(),
  ])

  return (
    <div className="prose md:prose-md lg:prose-lg dark:prose-invert">
      <h1>{metadata.title}</h1>
      <Content />
      {updatedAt ? (
        <div
          css={{
            fontSize: 'var(--font-size-body-3)',
            color: 'var(--color-foreground-secondary)',
          }}
        >
          Last updated{' '}
          <time
            dateTime={updatedAt.toString()}
            itemProp="dateModified"
            css={{ fontWeight: 600 }}
          >
            {updatedAt.toLocaleString('en', {
              year: '2-digit',
              month: '2-digit',
              day: '2-digit',
            })}
          </time>
        </div>
      ) : null}
    </div>
  )
}
