import Link from 'next/link'

import { ComponentsCollection, type ComponentSource } from '@/collections'

export default async function Components() {
  return (
    <>
      <h1>Components</h1>
      <ul>
        {(await ComponentsCollection.getSources({ depth: 1 })).map((source) => (
          <ComponentItem key={source.getPath()} source={source} />
        ))}
      </ul>
    </>
  )
}

async function ComponentItem({ source }: { source: ComponentSource }) {
  const path = source.getPath()

  return (
    <li key={path}>
      <Link href={path}>
        <h2>{source.getName()}</h2>
      </Link>
    </li>
  )
}
