import * as React from 'react'

export function Outline({ data }: { data: any }) {
  if (data?.mdx?.headings) {
    return (
      <ul>
        {data.mdx.headings.map((heading: any) => (
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
