import Link from 'next/link'

export default function Page() {
  return (
    <>
      <h1>Design System Documentation</h1>
      <nav style={{ display: 'grid' }}>
        <Link href="/components">Components</Link>
      </nav>
    </>
  )
}
