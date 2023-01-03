import * as React from 'react'
import { DataProviderContext } from './DataProvider'

export function Headings() {
  const { dataItem } = React.useContext(DataProviderContext)

  if (dataItem?.mdx?.headings) {
    return (
      <ul
        style={{
          position: 'sticky',
          top: 0,
          alignSelf: 'start',
          padding: 0,
          margin: 0,
          listStyle: 'none',
          borderLeft: '1px solid #ccc',
        }}
      >
        {dataItem.mdx.headings
          .filter((heading) => heading.depth > 1)
          .map((heading: any) => (
            <li
              key={heading.text}
              style={{ marginLeft: (heading.depth - 1) * 10 }}
            >
              <a
                href={`#${heading.id}`}
                style={{ display: 'block', padding: '0.5rem' }}
              >
                {heading.text}
              </a>
            </li>
          ))}
      </ul>
    )
  }

  return null
}
