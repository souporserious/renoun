import type { Headings } from 'renoun'

import { docs, routes } from '@/collections'
import { SiblingLinks } from '@/ui/SiblingLinks'
import { TableOfContents } from '@/ui/TableOfContents'

export async function generateStaticParams() {
  return (await routes).map((entry) => ({ slug: entry.segments }))
}

export default async function Page(props: PageProps<'/[...slug]'>) {
  const { slug } = await props.params
  const doc = await docs.getFile(slug, 'mdx')
  const [Content, metadata, headings, updatedAt] = await Promise.all([
    doc.getExportValue('default'),
    doc.getExportValue('metadata'),
    doc.getExportValue('headings'),
    doc.getLastCommitDate(),
  ])

  return (
    <>
      <div className="col-end-[-1] md:col-start-[4] md:col-end-[-2] lg:col-end-[5] md:row-start-[1] md:row-end-[-1] py-25">
        <div className="prose md:prose-md lg:prose-lg dark:prose-invert">
          <h1>{metadata.title}</h1>
          <div className="mb-32 [&>p:first-of-type]:text-2xl [&>p:first-of-type]:text-blue-400 dark:[&>p:first-of-type]:text-blue-200 [&>p:first-of-type]:mb-8 [text-box:trim-both_cap_alphabetic]">
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
      </div>

      <aside className="hidden lg:flex lg:flex-col lg:py-8 lg:gap-8 lg:col-start-[6] lg:col-end-[7] lg:row-start-[1] lg:row-end-[-1]">
        <SiblingLinks routes={await routes} />
        <TableOfContents headings={headings as Headings} />
      </aside>
    </>
  )
}
