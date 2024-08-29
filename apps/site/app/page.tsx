import Link from 'next/link'

export default function Page() {
  return (
    <main css={{ padding: '4rem 0' }}>
      <h1>Omnidoc</h1>
      <nav style={{ display: 'grid' }}>
        <Link href="/collections">Collections</Link>
        <Link href="/components">Components</Link>
      </nav>
    </main>
  )
}
