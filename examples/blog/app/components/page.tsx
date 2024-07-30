import Link from 'next/link'
import { ComponentsCollection } from './[...slug]/page'

export default async function Components() {
  return (
    <>
      <h1>Components</h1>
      <ul>
        {ComponentsCollection.getSources().map((PostSource) => (
          <ComponentItem
            key={PostSource.getPathname()}
            ComponentSource={PostSource}
          />
        ))}
      </ul>
    </>
  )
}

async function ComponentItem({
  ComponentSource,
}: {
  ComponentSource: ReturnType<(typeof ComponentsCollection)['getSource']>
}) {
  const pathname = ComponentSource.getPathname()
  return (
    <li key={pathname}>
      <Link href={pathname}>
        <h2>{pathname}</h2>
      </Link>
    </li>
  )
}
