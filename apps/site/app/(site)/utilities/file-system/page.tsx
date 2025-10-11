import { FileSystemDirectory } from '@/collections'
import { References } from '@/components/Reference'
import { TableOfContents } from '@/components/TableOfContents'

export default async function Page() {
  const sourceFile = await FileSystemDirectory.getFile('index', 'tsx')

  if (!sourceFile) {
    return null
  }

  const docFile = await FileSystemDirectory.getFile('README', 'mdx')

  if (!docFile) {
    return null
  }

  const Content = await docFile.getExportValue('default')
  const docHeadings = await docFile.getHeadings()
  const fileExports = await sourceFile.getExports()
  const referenceHeadings = await sourceFile.getHeadings()

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
              marginBlockEnd: '2rem',
            }}
          >
            API Reference
          </h2>
          <References fileExports={fileExports} />
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
            ...docHeadings,
            ...(referenceHeadings.length
              ? [
                  {
                    id: 'api-reference',
                    text: 'API Reference',
                    children: 'API Reference',
                    level: 2,
                  },
                  ...referenceHeadings,
                ]
              : []),
          ]}
        />
      </div>
    </>
  )
}
