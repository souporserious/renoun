import { getPathData } from 'mdxts/utils'

export function SiblingNavigation({
  data,
  pathname,
}: {
  data: Record<string, any>
  pathname: string[]
}) {
  const { previous, next } = getPathData(data, pathname)
  return (
    <nav style={{ display: 'flex', padding: '4rem 0 2rem' }}>
      {previous ? (
        <a href={`/${previous.pathname.replace('docs/', '')}`}>
          {previous.title}
        </a>
      ) : null}
      <div style={{ flex: 1 }} />
      {next ? (
        <a href={`/${next.pathname.replace('docs/', '')}`}>{next.title}</a>
      ) : null}
    </nav>
  )
}
