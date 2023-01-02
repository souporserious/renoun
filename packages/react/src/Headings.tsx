import * as React from 'react'
import { DataProviderContext } from './DataProvider'

// Export either a remark, rehype, or tsmorph plugin
// export function remarkPlugin() {

// }

// export function loader(project, sourceFile, addPlugin) {

// }

// Attaches data to the dataItem
// dataItem.remark.headings
// dataItem.tsmorph.references

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
