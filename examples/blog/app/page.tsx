import Link from 'next/link'

export default function Page() {
  return (
    <>
      <h1>Page Title</h1>
      <nav style={{ display: 'grid' }}>
        <Link href="/posts">Posts</Link>
        <Link href="/components">Components</Link>
      </nav>
    </>
  )
}
