import Link from 'next/link'
import { Text } from 'components/Text'
import { Logo } from 'components/Logo'
import allDocs from 'mdxts/docs'

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
    </aside>
  )
}
