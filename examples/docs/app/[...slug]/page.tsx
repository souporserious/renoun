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
      <div className="mb-32 [&>p:first-of-type]:-mt-6 [&>p:first-of-type]:text-2xl [&>p:first-of-type]:text-blue-400 dark:[&>p:first-of-type]:text-blue-200 [&>p:first-of-type]:mb-8">
        <Content />
      </div>
      {updatedAt ? (
        <div className="text-sm text-gray-600 dark:text-gray-300">
          Last updated{' '}
          <time
            dateTime={updatedAt.toString()}
            itemProp="dateModified"
            className="font-semibold"
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
