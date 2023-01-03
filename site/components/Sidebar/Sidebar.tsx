import Link from 'next/link'
import { Text } from 'components/Text'
import { Logo } from 'components/Logo'
import allDocs from 'mdxts/docs'
import allReact from 'mdxts/react'

export function Sidebar() {
  return (
    <aside
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '2rem',
        gap: '2rem',
      }}
    >
      <a href="/">
        <h1>
          <Logo />
        </h1>
      </a>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h2 style={{ fontSize: 'var(--font-size-title)', lineHeight: 1 }}>
          Docs
        </h2>
        <ul style={{ padding: 0, listStyle: 'none' }}>
          {allDocs.map((data) => {
            return (
              <li key={data.slug}>
                <Link href={data.slug} className="link">
                  <Text>{data.name}</Text>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h2 style={{ fontSize: 'var(--font-size-title)', lineHeight: 1 }}>
          React
        </h2>
        <ul style={{ padding: 0, listStyle: 'none' }}>
          {allReact.map((data) => {
            return (
              <li key={data.slug}>
                <Link href={data.slug} className="link">
                  <Text>{data.name}</Text>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </aside>
  )
}
