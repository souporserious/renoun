import Link from 'next/link'

import { PostsCollection, type PostSource } from './[...slug]/page'

async function TreeNavigation({ Source }: { Source: PostSource }) {
  const Sources = Source.getSources()
  const depth = Source.getDepth()
  const path = Source.getPath()
  // const frontMatter = await Source.getNamedExport('frontmatter').getValue()

  if (Sources.length === 0) {
    return (
      <li style={{ paddingLeft: `${depth}rem` }}>
        <Link
          href={path}
          style={{
            display: 'grid',
            color: 'white',
          }}
        >
          {Source.getName()} <small>{Source.getPath()}</small>
          {/* {frontMatter?.title || Source.getName()} */}
        </Link>
      </li>
    )
  }

  const childrenSources = Sources.map((ChildSource) => (
    <TreeNavigation key={ChildSource.getPath()} Source={ChildSource} />
  ))

  if (depth > 0) {
    return (
      <li style={{ paddingLeft: `${depth}rem` }}>
        <Link href={path} style={{ color: 'white' }}>
          {Source.getName()} <small>{Source.getPath()}</small>
          {/* {frontMatter?.title || Source.getName()} */}
        </Link>
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
          }}
        >
          {childrenSources}
        </ul>
      </li>
    )
  }

  return (
    <ul
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
      }}
    >
      {childrenSources}
    </ul>
  )
}

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr' }}>
      <aside>
        <h2>Posts</h2>
        <ul
          style={{
            display: 'grid',
            gap: '1rem',
            listStyle: 'none',
            padding: 0,
            margin: 0,
          }}
        >
          {PostsCollection.getSources().map((Source) => (
            <TreeNavigation key={Source.getPath()} Source={Source} />
          ))}
        </ul>
      </aside>
      <main>{children}</main>
    </div>
  )
}
