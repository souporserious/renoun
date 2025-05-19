import { TypeReference } from 'renoun/components'

import { FileSystemCollection } from '@/collections'
import { TableOfContents } from '@/components/TableOfContents'

export default async function Page() {
  const sourceFile = await FileSystemCollection.getFile('index', 'tsx')

  if (!sourceFile) {
    return null
  }

  const docFile = await FileSystemCollection.getFile('README', 'mdx')

  if (!docFile) {
    return null
  }

  const Content = await docFile.getExportValue('default')
  const headings = await docFile.getExportValue('headings')
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
          <h1 css={{ fontSize: '3rem', margin: 0 }}>File System</h1>
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
          {fileExports.map((fileExport) => (
            <TypeReference key={fileExport.getName()} source={fileExport} />
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
            ...fileExports.map((fileExport) => ({
              id: fileExport.getSlug(),
              text: fileExport.getName(),
              depth: 3,
            })),
          ]}
        />
      </div>
    </>
  )
}
