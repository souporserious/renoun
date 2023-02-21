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

      {renderNavigation(allDocs[0].children)}
    </aside>
  )
}

function renderNavigation(data: any, order: number = 0) {
  return (
    <ul
      style={{
        padding: 0,
        paddingLeft: order * 0.5 + 'rem',
        listStyle: 'none',
      }}
    >
      {data.map((item: any) => {
        return (
          <li key={item.pathname}>
            <Link href={item.pathname} className="link">
              <Text>{item.name}</Text>
            </Link>
            {item.children && renderNavigation(item.children, order + 1)}
          </li>
        )
      })}
    </ul>
  )
}
