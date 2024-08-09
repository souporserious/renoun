import { type NamedExportSource } from 'mdxts/collections'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ComponentsCollection, type ComponentSource } from '@/collections'

export async function generateStaticParams() {
  return (await ComponentsCollection.getSources()).map((Source) => ({
    slug: Source.getPathSegments(),
  }))
}

async function ComponentExport({
  NamedExport,
}: {
  NamedExport: NamedExportSource<React.ComponentType>
}) {
  const name = NamedExport.getName()
  const position = NamedExport.getPosition()
  const Component = await NamedExport.getValue().catch(() => null)

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
  const [PreviousSource, NextSource] = await ComponentSource.getSiblings(0)
  const isExamplesPage = params.slug.at(-1) === 'examples'
  const updatedAt = await ComponentSource.getUpdatedAt()
  const editPath = ComponentSource.getEditPath()

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

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          padding: '1rem',
        }}
      >
        {updatedAt ? (
          <div style={{ gridColumn: 1, textAlign: 'left' }}>
            Last updated: {new Date(updatedAt).toLocaleString()}
          </div>
        ) : null}

        {editPath ? (
          <a href={editPath} style={{ gridColumn: 2, textAlign: 'right' }}>
            Edit this page
          </a>
        ) : null}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          padding: '1rem',
        }}
      >
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
  const path = Source.getPath()

  return (
    <Link
      href={path}
      style={{
        gridColumn: direction === 'previous' ? 1 : 2,
        textAlign: direction === 'previous' ? 'left' : 'right',
      }}
    >
      <div>{direction === 'previous' ? 'Previous' : 'Next'}</div>
      {path}
    </Link>
  )
}
