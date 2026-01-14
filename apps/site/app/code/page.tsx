import { CodeBlock as DefaultCodeBlock, type CodeBlockProps } from 'renoun'
import { GeistMono } from 'geist/font/mono'

const codeA = `npm install renoun`
const codeB = `
import { Directory } from 'renoun'

const posts = new Directory({
  path: 'posts',
  filter: '*.mdx',
})

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const slug = (await params).slug
  const post = await posts.getFile(slug, 'mdx')
  const Content = await post.getExportValue('default')

  return <Content />
}
`.trim()

function CodeBlock({
  backgroundColor,
  ...restProps
}: CodeBlockProps & { backgroundColor?: string }) {
  return (
    <DefaultCodeBlock
      {...restProps}
      allowCopy={false}
      allowErrors
      showErrors
      components={{
        Container: {
          className: GeistMono.className,
          style: {
            padding: '10rem',
            borderRadius: '0',
            backgroundColor,
          },
        },
      }}
    />
  )
}

export default function Page() {
  return (
    <div
      css={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2rem',
        padding: '4rem',
      }}
    >
      {/* <CodeBlock language="tsx" children={codeB} backgroundColor="#381c22" /> */}
      <CodeBlock language="shell" children={codeA} />
    </div>
  )
}
