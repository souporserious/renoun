import { CodeBlock } from 'mdxts/components'
import {
  createCollection,
  type MDXContent,
  type ExportSource,
} from 'mdxts/collections'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ComponentsCollection, type ComponentSource } from '@/collections'

export async function generateStaticParams() {
  return (await ComponentsCollection.getPathSegments()).map((pathSegments) => ({
    slug: pathSegments,
  }))
}

async function ComponentExport({
  exportSource,
}: {
  exportSource: ExportSource<React.ComponentType>
}) {
  const name = exportSource.getName()
  const Component = await exportSource.getValue().catch(() => null)

  return (
    <div key={name}>
      <h3>{name}</h3>
      {Component ? <Component /> : null}
      <CodeBlock allowErrors value={exportSource.getText()} language="tsx" />
    </div>
  )
}

const ComponentsReadmeCollection = createCollection<{ default: MDXContent }>(
  '@/components/**/README.mdx',
  {
    baseDirectory: 'components',
    basePath: 'components',
  }
)

export default async function Component({
  params,
}: {
  params: { slug: string[] }
}) {
  const componentsPathname = ['components', ...params.slug]
  const componentSource = ComponentsCollection.getSource(componentsPathname)

  if (!componentSource) {
    notFound()
  }

  const readmeSource = ComponentsReadmeCollection.getSource([
    ...componentsPathname,
    'readme',
  ])
  const Readme = await readmeSource?.getDefaultExport().getValue()
  const examplesSource = componentSource.getSource('examples')
  const examples = await examplesSource?.getSources()
  const isExamplesPage = params.slug.at(-1) === 'examples'
  const updatedAt = await componentSource.getUpdatedAt()
  const editPath = componentSource.getEditPath()
  const [previousSource, nextSource] = await componentSource.getSiblings(0)

  return (
    <>
      <Link href="/components">All Components</Link>
      <h1>{componentSource.getTitle()}</h1>

      {Readme ? <Readme /> : null}

      <h2>Exports</h2>
      {componentSource.getExports().map((exportSource) => (
        <ComponentExport
          key={exportSource.getName()}
          exportSource={exportSource}
        />
      ))}

      {isExamplesPage || !examples ? null : (
        <>
          <h2>Examples</h2>
          {examples.map((examplesSource) =>
            examplesSource
              .getExports()
              .map((exportSource) => (
                <ComponentExport
                  key={exportSource.getName()}
                  exportSource={exportSource}
                />
              ))
          )}
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
        {previousSource ? (
          <SiblingLink source={previousSource} direction="previous" />
        ) : null}
        {nextSource ? (
          <SiblingLink source={nextSource} direction="next" />
        ) : null}
      </div>
    </>
  )
}

async function SiblingLink({
  source,
  direction,
}: {
  source: ComponentSource
  direction: 'previous' | 'next'
}) {
  const path = source.getPath()

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
