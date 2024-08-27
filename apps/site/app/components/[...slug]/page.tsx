import { CodeBlock, Tokens } from 'mdxts/components'
import {
  createCollection,
  type MDXContent,
  type ExportSource,
} from 'mdxts/collections'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ComponentsCollection, type ComponentSource } from '@/collections'
import { Stack } from '@/components'

export async function generateStaticParams() {
  const sources = await ComponentsCollection.getSources()

  return sources
    .filter((source) => source.isFile())
    .map((source) => ({ slug: source.getPathSegments() }))
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
  const examplesSources = await examplesSource?.getSources()
  const isExamplesPage = params.slug.at(-1) === 'examples'
  const examplesExports = isExamplesPage
    ? componentSource.getExports()
    : examplesSource
      ? examplesSources?.length
        ? examplesSources.flatMap((source) => source.getExports())
        : examplesSource.getExports()
      : []
  const updatedAt = await componentSource.getUpdatedAt()
  const editPath = componentSource.getEditPath()
  const [previousSource, nextSource] = await componentSource.getSiblings({
    depth: 0,
  })

  return (
    <div
      css={{
        display: 'flex',
        flexDirection: 'column',
        padding: '4rem 0',
        gap: '4rem',
      }}
    >
      <div>
        <h1>
          {componentSource.getName()} {isExamplesPage ? 'Examples' : ''}
        </h1>
        {Readme ? <Readme /> : null}
      </div>

      <div>
        <h2 css={{ margin: '0 0 2rem' }}>Exports</h2>
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
      </div>

      {examplesExports.length ? (
        <div>
          <h2 css={{ margin: '0 0 2rem' }}>Examples</h2>
          <ul
            css={{
              listStyle: 'none',
              display: 'grid',
              padding: 0,
              margin: 0,
              gap: '2rem',
            }}
          >
            {examplesExports.map((exportSource) => (
              <li key={exportSource.getName()}>
                <Preview source={exportSource} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
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

        <nav
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
        </nav>
      </div>
    </div>
  )
}

async function Preview({
  source,
}: {
  source: ExportSource<React.ComponentType>
}) {
  const name = source.getName()
  const description = source.getDescription()
  const editPath = source.getEditPath()
  const Value = await source.getValue()
  const isUppercase = name[0] === name[0].toUpperCase()
  const isComponent = typeof Value === 'function' && isUppercase

  return (
    <section
      key={name}
      css={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
    >
      <header>
        <Stack flexDirection="row" alignItems="baseline" gap="0.5rem">
          <h3 css={{ margin: 0 }}>{name}</h3>{' '}
          <a href={editPath}>Edit example</a>
        </Stack>
        {description ? <p>{description}</p> : null}
      </header>

      <div
        css={{
          display: 'grid',
          gridTemplateRows: isComponent ? 'minmax(16rem, 1fr) auto' : undefined,
          borderRadius: 5,
          boxShadow: '0 0 0 1px #3b4252',
          overflow: 'clip',
        }}
      >
        {isComponent ? (
          <div
            css={{
              padding: '4rem',
              margin: 'auto',
              overflow: 'auto',
            }}
          >
            <Value />
          </div>
        ) : null}
        <CodeBlock allowErrors value={source.getText()} language="tsx">
          <pre
            css={{
              position: 'relative',
              whiteSpace: 'pre',
              wordWrap: 'break-word',
              padding: '0.5lh',
              margin: 0,
              overflow: 'auto',
              backgroundColor: '#2e3440',
            }}
          >
            <Tokens />
          </pre>
        </CodeBlock>
      </div>
    </section>
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
