import Link from 'next/link'

export default function Page() {
  return (
    <main css={{ padding: '4rem 0' }}>
      <h1>Package Example</h1>
      <nav style={{ display: 'grid' }}>
        <Link href="/components">Components</Link>
      </nav>
    </main>
  )
}
