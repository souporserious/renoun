import { APIReference } from 'renoun/components'

import { CollectionsCollection, CollectionsDocsCollection } from '@/collections'
import { TableOfContents } from '@/components/TableOfContents'

export default async function Page() {
  const sourceFile = await CollectionsCollection.getFile('index', 'tsx')

  if (!sourceFile) {
    return null
  }

  const docFile = await CollectionsDocsCollection.getFile('index', 'mdx')

  if (!docFile) {
    return null
  }

  const Content = await (
    await docFile.getExportOrThrow('default')
  ).getRuntimeValue()
  const headings = await (
    await docFile.getExportOrThrow('headings')
  ).getRuntimeValue()
  const fileExports = await sourceFile.getExports()

  return (
    <>
      <div
        css={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1.6rem',
        }}
      >
        <div
          css={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.6rem',
          }}
          className="prose"
        >
          <h1 css={{ fontSize: '3rem', margin: 0 }}>Collections</h1>
          <Content />
        </div>
        <div>
          <h2
            id="api-reference"
            css={{
              fontSize: 'var(--font-size-heading-2)',
              lineHeight: 'var(--line-height-heading-2)',
              fontWeight: 'var(--font-weight-heading)',
              marginBlockStart: '1.6rem',
            }}
          >
            API Reference
          </h2>
          {fileExports.map(async (exportSource) => (
            <APIReference
              key={await exportSource.getName()}
              source={exportSource}
            />
          ))}
        </div>
      </div>

      <div
        css={{
          alignSelf: 'start',
          position: 'sticky',
          top: '1rem',
          '@media (max-width: 767px)': {
            display: 'none',
          },
        }}
      >
        <TableOfContents
          headings={[
            ...headings,
            {
              id: 'api-reference',
              text: 'API Reference',
              depth: 2,
            },
            ...(await Promise.all(
              fileExports.map(async (source) => ({
                id: await source.getSlug(),
                text: await source.getName(),
                depth: 3,
              }))
            )),
          ]}
        />
      </div>
    </>
  )
}
