import { Directory, Navigation } from 'renoun'

const docs = new Directory({ path: 'docs', filter: '*.mdx' })

export function BasicUsage() {
  return (
    <Navigation
      source={docs}
      components={{
        Root: ({ children }) => {
          return <nav>{children}</nav>
        },
        List: ({ children }) => {
          return (
            <ul
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: 0,
                gap: '0.5rem',
                listStyle: 'none',
              }}
            >
              {children}
            </ul>
          )
        },
        Item: ({ children }) => {
          return <li>{children}</li>
        },
        Link: ({ entry, depth, pathname, ...props }) => {
          return (
            <a {...props} href={pathname}>
              {entry.name}
            </a>
          )
        },
      }}
    />
  )
}
