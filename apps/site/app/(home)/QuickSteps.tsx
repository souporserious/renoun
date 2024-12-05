import type { CodeBlockProps } from 'renoun/components'

import { ButtonLink } from '@/components/ButtonLink'
import { CodeBlock } from '@/components/CodeBlock'
import { Text } from '@/components/Text'

const steps = [
  {
    title: 'Collect',
    content: `Collect, organize, and validate structured data using the File System API.`,
    code: `import { Directory } from 'renoun/file-system'
import type { MDXContent } from 'renoun/mdx'

const posts = new Directory<{ mdx: { default: MDXContent } }>({
  path: 'posts'
})`,
  },
  {
    title: 'Render',
    content: `Query and render your file system entries programmatically using a simple API.`,
    code: `import { Directory } from 'renoun/file-system'
import type { MDXContent } from 'renoun/mdx'

const posts = new Directory<{ mdx: { default: MDXContent } }>({
  path: 'posts',
}).withModule((path) => import(\`./posts/\${path}\`))

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const post = await posts.getFile((await params).slug, 'mdx')

  if (!post) {
    return <div>Post not found</div>
  }

  const Content = await post.getExportValueOrThrow('default')
    
  return <Content />
}`,
    codeBlockProps: {
      focusedLines: '6,9-23',
    },
  },
  {
    title: 'Personalize',
    content: `Select from a growing list of pre-built components to tailor your content and documentation to fit your unique needs and brand identity.`,
    code: `import { CodeBlock, Tokens } from 'renoun/components'

export function Page() {
  return (
    <CodeBlock
      language="tsx"
      value={\`import { CodeBlock } from 'renoun/components'\`} 
    >
      <pre>
        <Tokens />
      </pre>
    </CodeBlock>
  )
}`,
  },
] satisfies {
  title: string
  content: string
  code: string
  codeBlockProps?: Partial<CodeBlockProps>
}[]

export function QuickSteps() {
  return (
    <section
      css={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '6rem 0',
        rowGap: '6rem',
      }}
    >
      <ol
        css={{
          display: 'flex',
          flexDirection: 'column',
          rowGap: '8rem',
          columnGap: '6rem',
          padding: 0,
          margin: 0,

          '@media (min-width: 60rem)': {
            display: 'grid',
            gridTemplateColumns: '32ch 1fr',
            rowGap: '8rem',
            columnGap: '6rem',
          },
        }}
      >
        {steps.map((step, index) => (
          <li
            key={index}
            css={{
              gridColumn: '1 / -1',
              display: 'grid',

              '@media (min-width: 60rem)': {
                gridTemplateColumns: 'subgrid',
              },
            }}
          >
            <figure
              css={{
                gridColumn: '1 / -1',
                display: 'grid',
                alignItems: 'center',

                '@media (min-width: 60rem)': {
                  gridTemplateColumns: 'subgrid',
                  gap: '4rem',
                },
              }}
            >
              <figcaption
                css={{
                  display: 'grid',
                  gridAutoRows: 'min-content',
                  gap: '1rem',
                }}
              >
                <span
                  aria-hidden="true"
                  css={{
                    alignSelf: 'end',
                    gridColumn: '1',
                    gridRow: '1',
                    fontSize: 'var(--font-size-body-2)',
                    fontWeight: 'bold',
                    marginBottom: '0.3rem',
                    color: '#E7C100',
                  }}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <Text
                  variant="heading-2"
                  css={{ gridColumn: '2', gridRow: '1' }}
                >
                  {step.title}
                </Text>
                <Text variant="body-1" css={{ gridColumn: '2', gridRow: '2' }}>
                  {step.content}
                </Text>
              </figcaption>
              <CodeBlock
                language="tsx"
                value={step.code}
                css={{
                  container: {
                    alignSelf: 'start',
                    marginTop: '2.6rem',
                  },
                }}
                {...step.codeBlockProps}
              />
            </figure>
          </li>
        ))}
      </ol>
      <ButtonLink href="/collections">
        Learn More About Collections →
      </ButtonLink>
    </section>
  )
}
