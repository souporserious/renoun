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

async function Export({
  source,
}: {
  source: ExportSource<React.ComponentType>
}) {
  const name = source.getName()
  const Value = await source.getValue()
  const isUppercase = name[0] === name[0].toUpperCase()
  const isComponent = typeof Value === 'function' && isUppercase

  return (
    <div key={name}>
      <h3>{name}</h3>
      {isComponent ? <Value /> : null}
      <CodeBlock allowErrors value={source.getText()} language="tsx" />
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
  const [previousSource, nextSource] = await componentSource.getSiblings({
    depth: 0,
  })

  return (
    <>
      <Link href="/components">All Components</Link>
      <h1>{componentSource.getTitle()}</h1>

      {Readme ? <Readme /> : null}

      <h2>Exports</h2>
      {componentSource.getExports().map((exportSource) => (
        <div key={exportSource.getName()}>
          <h3>{exportSource.getName()}</h3>
          <CodeBlock
            allowErrors
            value={exportSource.getText()}
            language="tsx"
          />
        </div>
      ))}

      {isExamplesPage || !examples ? null : (
        <>
          <h2>Examples</h2>
          {examples.map((examplesSource) =>
            examplesSource
              .getExports()
              .map((exportSource) => (
                <Export key={exportSource.getName()} source={exportSource} />
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
  return (
    <Link
      href={source.getPath()}
      style={{
        gridColumn: direction === 'previous' ? 1 : 2,
        textAlign: direction === 'previous' ? 'left' : 'right',
      }}
    >
      <div>{direction === 'previous' ? 'Previous' : 'Next'}</div>
      {source.getTitle()}
    </Link>
  )
}
