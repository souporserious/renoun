---
'mdxts': major
---

Removes `Navigation` component in favor of using `createCollection` directly.

### Breaking Changes

Use `createCollection` to generate navigations:

#### List Navigation

Use `getSources` to render a list of the immediate sources in the collection:

```tsx filename="app/posts/page.tsx"
export default async function Page() {
  return (
    <>
      <h1>All Posts</h1>
      <ul>
        {PostsCollection.getSources().map((source) => (
          <Post key={source.getPath()} source={source} />
        ))}
      </ul>
    </>
  )
}
```

#### Tree Navigation

Similar to list navigation, we can use `getSources` recursively to render a tree of links:

```tsx filename="app/posts/layout.tsx"
import { PostsCollection } from '@/collections'

export default async function Layout() {
  return (
    <nav>
      <ul>
        <TreeNavigation Source={PostsCollection} />
      </ul>
    </nav>
  )
}

async function TreeNavigation({ source }: { source: PostSource }) {
  const sources = source.getSources({ depth: 1 })
  const path = source.getPath()
  const depth = source.getDepth()
  const frontmatter = await source.getNamedExport('frontmatter').getValue()

  if (sources.length === 0) {
    return (
      <li style={{ paddingLeft: `${depth}rem` }}>
        <Link href={path} style={{ color: 'white' }}>
          {frontmatter.title}
        </Link>
      </li>
    )
  }

  const childrenSources = sources.map((childSource) => (
    <TreeNavigation key={childSource.getPath()} source={childSource} />
  ))

  if (depth > 0) {
    return (
      <li style={{ paddingLeft: `${depth}rem` }}>
        <Link href={path} style={{ color: 'white' }}>
          {frontmatter.title}
        </Link>
        <ul>{childrenSources}</ul>
      </li>
    )
  }

  return <ul>{childrenSources}</ul>
}
```

#### Sibling Navigation

Use `getSiblings` to get the previous and next sources in the collection:

```tsx filename="app/posts/[slug]/page.tsx"
export default async function Page({ params }) {
  const postSource = Posts.getSource(params.slug)

  if (!postSource) notFound()

  const Post = await postSource.getDefaultExport().getValue()
  const frontmatter = await postSource.getNamedExport('frontmatter').getValue()
  const [previous, next] = postSource.getSiblings()

  return (
    <>
      <h1>{frontmatter.title}</h1>
      <p>{frontmatter.description}</p>
      <Post />
      {previous ? <Sibling source={previous} direction="previous" /> : null}
      {next ? <Sibling source={next} direction="next" /> : null}
    </>
  )
}

function Sibling({
  source,
  direction,
}: {
  source: ReturnType<typeof Posts.getSource>
  direction: 'previous' | 'next'
}) {
  const frontmatter = await source.getNamedExport('frontmatter').getValue()
  return (
    <a href={source.getPath()}>
      <span>{direction === 'previous' ? 'Previous' : 'Next'}</span>
      {frontmatter.title}
    </a>
  )
}
```
