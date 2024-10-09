import { CodeBlock } from '@/components/CodeBlock'
import { Text } from '@/components/Text'

const steps = [
  {
    title: 'Collect',
    content: `Start by adding structured data to your file system. Organize your content or documentation using collections to query and retrieve your source files with ease.`,
    code: `import { collection } from 'renoun/collections'\n\nconst posts = collection({ filePattern: 'docs/*.mdx' })`,
  },
  {
    title: 'Render',
    content: `Easily query and render your file system sources programmatically.`,
    code: `import { collection } from 'renoun/collections'\n\nconst posts = collection({ filePattern: 'docs/*.mdx' })\n\nexport default async function Page( params ) {\n  const Content = await posts\n    .getSource(params.slug)\n    .getDefaultExport()\n    .getValue()\n\n  return <Content />\n}`,
  },
  {
    title: 'Elevate',
    content: `Customize with flexibility. Select from a growing list of pre-built components to tailor your documentation to fit your unique needs and brand identity.`,
    code: `import { CodeBlock } from 'renoun/components'\n\nexport function Page() {\n  return (\n    <div>\n      <h1>Start Writing Docs in 3 Steps</h1>\n      <CodeBlock\n        language="tsx"\n        value={\`import { CodeBlock } from 'renoun/components'\`}\n      />\n    </div>\n  )\n}`,
  },
]

export function QuickSteps() {
  return (
    <section css={{ padding: '6rem 0' }}>
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
                allowErrors
                language="tsx"
                value={step.code}
                css={{
                  container: {
                    alignSelf: 'start',
                    marginTop: '2.6rem',
                  },
                }}
              />
            </figure>
          </li>
        ))}
      </ol>
    </section>
  )
}
