import { allDocs } from 'app/all-docs'

export default function Page({ params }) {
  const doc = allDocs[`docs/${params.slug[0]}`]

  if (doc == undefined) {
    return <div>404</div>
  }

  const Component = doc.default

  console.log(doc.headings)

  return (
    <>
      <ul>
        {doc.headings?.map(({ text, id }) => (
          <li>
            <a href={`#${id}`}>{text}</a>
          </li>
        ))}
      </ul>
      <Component />
    </>
  )
}
