import * as React from 'react'
import { DataProviderContext } from './DataProvider'

export function Headings() {
  const { dataItem } = React.useContext(DataProviderContext)

  if (dataItem?.mdx?.headings) {
    return (
      <ul>
        {dataItem.mdx.headings.map((heading: any) => (
          <li
            key={heading.text}
            style={{
              marginLeft: heading.depth * 10,
            }}
          >
            <a href={`#${heading.id}`}>{heading.text}</a>
          </li>
        ))}
      </ul>
    )
  }

  return null
}
