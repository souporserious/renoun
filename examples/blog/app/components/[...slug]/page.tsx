import {
  createCollection,
  type FileSystemSource,
  type NamedExportSource,
} from 'mdxts/collections'
import Link from 'next/link'
import { notFound } from 'next/navigation'

type ComponentSchema = Record<string, React.ComponentType>

export type ComponentSource = FileSystemSource<ComponentSchema>

export const ComponentsCollection = createCollection<ComponentSchema>(
  '@/components/**/{index,*.examples}.{ts,tsx}',
  {
    baseDirectory: 'components',
    basePath: 'components',
  }
)

async function ComponentExport({
  NamedExport,
}: {
  NamedExport: NamedExportSource<React.ComponentType>
}) {
  const name = NamedExport.getName()
  const position = NamedExport.getPosition()
  const Component = await NamedExport.getValue()

  return (
    <div key={name}>
      <h3>{name}</h3>
      {Component ? <Component /> : null}
      <pre>
        {position.start.line}:{position.start.column} - {position.end.line}:
        {position.end.column}
      </pre>
    </div>
  )
}

export default async function Component({
  params,
}: {
  params: { slug: string[] }
}) {
  const componentsPathname = ['components', ...params.slug]
  const ComponentSource = ComponentsCollection.getSource(componentsPathname)

  if (!ComponentSource) {
    notFound()
  }

  const ExamplesSource = ComponentsCollection.getSource([
    ...componentsPathname,
    'examples',
  ])
  const [PreviousSource, NextSource] = ComponentSource.getSiblings()
  const isExamplesPage = params.slug.at(-1) === 'examples'
  const updatedAt = await ComponentSource.getUpdatedAt()

  return (
    <>
      <Link href="/components">All Components</Link>
      <h1>{ComponentSource.getPath()}</h1>

      <h2>Exports</h2>
      {ComponentSource.getNamedExports().map((NamedExport) => (
        <ComponentExport
          key={NamedExport.getName()}
          NamedExport={NamedExport}
        />
      ))}

      {isExamplesPage || !ExamplesSource ? null : (
        <>
          <h2>Examples</h2>
          {ExamplesSource.getNamedExports().map((NamedExport) => (
            <ComponentExport
              key={NamedExport.getName()}
              NamedExport={NamedExport}
            />
          ))}
        </>
      )}

      {updatedAt ? (
        <div>Last updated: {new Date(updatedAt).toLocaleString()}</div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {PreviousSource ? (
          <SiblingLink Source={PreviousSource} direction="previous" />
        ) : null}
        {NextSource ? (
          <SiblingLink Source={NextSource} direction="next" />
        ) : null}
      </div>
    </>
  )
}

async function SiblingLink({
  Source,
  direction,
}: {
  Source: ComponentSource
  direction: 'previous' | 'next'
}) {
  const pathname = Source.getPath()

  return (
    <Link
      href={pathname}
      style={{
        gridColumn: direction === 'previous' ? 1 : 2,
        textAlign: direction === 'previous' ? 'left' : 'right',
      }}
    >
      <div>{direction === 'previous' ? 'Previous' : 'Next'}</div>
      {pathname}
    </Link>
  )
}
