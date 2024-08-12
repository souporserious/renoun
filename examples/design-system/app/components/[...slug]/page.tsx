import { CodeBlock } from 'mdxts/components'
import {
  createCollection,
  type MDXContent,
  type NamedExportSource,
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
  namedExport,
}: {
  namedExport: NamedExportSource<React.ComponentType>
}) {
  const name = namedExport.getName()
  const Component = await namedExport.getValue().catch(() => null)

  return (
    <div key={name}>
      <h3>{name}</h3>
      {Component ? <Component /> : null}
      <CodeBlock allowErrors value={namedExport.getText()} language="tsx" />
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
  const componentSource = ComponentsCollection.getSource([
    ...componentsPathname,
    'index',
  ])
  const readmeSource = ComponentsReadmeCollection.getSource([
    ...componentsPathname,
    'readme',
  ])

  if (!componentSource) {
    notFound()
  }

  const examplesSource = ComponentsCollection.getSource([
    ...componentsPathname,
    'examples',
  ])
  const Readme = await readmeSource?.getDefaultExport().getValue()
  const [previousSource, nextSource] = await componentSource.getSiblings(0)
  const isExamplesPage = params.slug.at(-1) === 'examples'
  const updatedAt = await componentSource.getUpdatedAt()
  const editPath = componentSource.getEditPath()

  return (
    <>
      <Link href="/components">All Components</Link>
      <h1>{componentSource.getTitle()}</h1>

      {Readme ? <Readme /> : null}

      <h2>Exports</h2>
      {componentSource.getNamedExports().map((namedExport) => (
        <ComponentExport
          key={namedExport.getName()}
          namedExport={namedExport}
        />
      ))}

      {isExamplesPage || !examplesSource ? null : (
        <>
          <h2>Examples</h2>
          {examplesSource.getNamedExports().map((namedExport) => (
            <ComponentExport
              key={namedExport.getName()}
              namedExport={namedExport}
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
