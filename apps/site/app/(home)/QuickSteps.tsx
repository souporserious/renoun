import type { CodeBlockProps } from 'renoun/components'

import { ButtonLink } from '@/components/ButtonLink'
import { CodeBlock } from '@/components/CodeBlock'
import { Text } from '@/components/Text'

const steps = [
  {
    title: 'Collect',
    content: `Collect, organize, and validate structured data using powerful file system utilities.`,
    code: `import { Directory, withSchema } from 'renoun/file-system'
import { z } from 'zod'

export const posts = new Directory({
  path: 'posts',
  include: '*.mdx',
  loaders: {
    mdx: withSchema(
      {
        frontmatter: z.object({
          title: z.string(),
          date: z.coerce.date(),
          summary: z.string().optional(),
          tags: z.array(z.string()).optional(),
        }),
      },
      (path) => import(\`./posts/\${path\}.mdx\`)
    ),
  },
  sort: 'frontmatter.date',
})`,
    cta: {
      label: 'View Utilities',
      href: '/utilities/file-system',
    },
  },
  {
    title: 'Render',
    content: `Query and render your file system entries programmatically in your favorite framework.`,
    code: `import { Directory } from 'renoun/file-system'

const posts = new Directory({ path: 'posts' })

async function Page({ slug }: { slug: string }) {
  const post = await posts.getFile(slug, 'mdx')
  const Content = await post.getExportValue('default')
    
  return <Content />
}`,
    codeBlockProps: {
      focusedLines: '4-20',
    },
    cta: {
      label: 'Framework Guides',
      href: '/guides',
    },
  },
  {
    title: 'Personalize',
    content: `Select from a growing list of pre-built components to tailor your content and documentation to fit your unique needs and brand identity.`,
    code: `import { CodeBlock, Tokens } from 'renoun/components'

function Page() {
  return (
    <CodeBlock language="tsx">
      <pre>
        <Tokens>const a = 1; const b = 2; a + b;</Tokens>
      </pre>
    </CodeBlock>
  )
}`,
    cta: {
      label: 'View Components',
      href: '/components',
    },
  },
] satisfies {
  title: string
  content: string
  code: string
  codeBlockProps?: Partial<CodeBlockProps>
  cta: { label: string; href: string }
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
      <div css={{ display: 'flex', flexDirection: 'column', gap: '1.6rem' }}>
        <Text variant="heading-2" css={{ textAlign: 'center' }}>
          Easy Setup so You Can Focus on What Matters
        </Text>
        <Text variant="body-1" css={{ textAlign: 'center' }}>
          Start writing type-safe content and documentation in just a few simple
          steps.
        </Text>
      </div>
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
                <ButtonLink
                  href={step.cta.href}
                  variant="secondary"
                  css={{ gridColumn: '2', gridRow: '3', justifySelf: 'start' }}
                >
                  {step.cta.label}
                </ButtonLink>
              </figcaption>
              <CodeBlock
                language="tsx"
                css={{
                  container: {
                    alignSelf: 'start',
                    marginTop: '2.6rem',
                  },
                }}
                {...step.codeBlockProps}
              >
                {step.code}
              </CodeBlock>
            </figure>
          </li>
        ))}
      </ol>
    </section>
  )
}
