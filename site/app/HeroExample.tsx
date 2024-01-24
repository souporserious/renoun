import Link from 'next/link'
import { basename } from 'node:path'
import { GeistMono } from 'geist/font/mono'
import { getTheme } from 'mdxts'
import { Code, type CodeProps } from 'mdxts/components'
import { allDocs } from 'data'

const docsPageSource = `
import { allDocs } from '../../data'

export default async function Page({ params }) {
  const doc = await allDocs.get(params.slug)
  const { Content } = doc
  return <Content />
}
`.trim()

const sidebarSource = `
import Link from 'next/link'
import { Navigation } from 'mdxts/components'
import { allDocs } from './data'

export function Sidebar() {
  return (
    <Navigation
      source={allDocs}
      renderList={props => (
        <ul>
          {props.children}
        </ul>
      )}
      renderItem={props => (
        <li key={props.label}>
          {props.depth === 0 ? (
            <div>{props.label}</div>
          ) : (
            <Link href={props.pathname}>{props.label}</Link>
          )}
          {props.children}
        </li>
      )}
    />
  )
}
`.trim()

const codeProps = {
  padding: '0.7rem',
  toolbar: false,
  style: {
    height: '100%',
    margin: 0,
    borderRadius: '0.5rem',
  },
} satisfies Partial<CodeProps>

const theme = getTheme()

export function HeroExample() {
  const entries = Object.values(allDocs.all())
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(20, 1fr)',
        gridAutoRows: '1.4rem',
        minHeight: '100dvh',
      }}
    >
      <Card title="docs" column="6/10" row="2/9">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            boxShadow: `0 0 0 1px ${theme.colors['contrastBorder']}`,
            borderRadius: '0.5rem',
          }}
        >
          {entries
            .filter((doc) => doc.depth === 1)
            .map((doc) => {
              return (
                <Link
                  key={doc.pathname}
                  href={doc.pathname}
                  className={GeistMono.className}
                  style={{
                    fontSize: '1rem',
                    lineHeight: '1.4rem',
                    padding: '0.7rem',
                    backgroundColor: theme.colors['editor.background'],
                    borderRadius: '0.5rem',
                    color: 'white',
                  }}
                >
                  {basename(doc.mdxPath!)}
                </Link>
              )
            })}
        </div>
      </Card>

      <Card title="data.ts" column="11/19" row="2/7">
        <Code
          value={`import { createSource } from 'mdxts'\n\nexport const allDocs = createSource('docs/*.mdx')`}
          filename="data.ts"
          {...codeProps}
        />
      </Card>

      <Card title="Sidebar.tsx" column="3/10" row="12/35">
        <Code value={sidebarSource} filename="Sidebar.tsx" {...codeProps} />
      </Card>

      <Card title="docs/[id]/page.tsx" column="11/19" row="12/21">
        <Code
          value={docsPageSource}
          filename="docs/[id]/page.tsx"
          {...codeProps}
        />
      </Card>

      <HorizontalLine column="9 / 11" row="6" />
      <HorizontalLine column="19 / 20" row="6" />
      <VerticalLine column="20" row="6 / 10" />
      <HorizontalLine column="2 / 20" row="10" />
      <VerticalLine column="10" row="10 / 14" align="center" />
      <HorizontalLine
        column="10"
        row="14"
        style={{ width: '50%', translate: '100%' }}
      />
      <VerticalLine column="2" row="10 / 16" />
      <HorizontalLine column="2 / 4" row="16" />
    </div>
  )
}

function Card({
  title,
  column,
  row,
  children,
}: {
  title: string
  column: string
  row: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.2rem',
        gridColumn: column,
        gridRow: row,
        position: 'relative',
      }}
    >
      <h2
        style={{
          alignSelf: 'start',
          fontSize: '1rem',
          lineHeight: '1rem',
          padding: '0.1rem 0.25rem',
          backgroundColor: theme.colors['button.background'],
          color: theme.colors['button.foreground'],
          borderRadius: '0.25rem',
          translate: '0 -50%',
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  )
}

function HorizontalLine({
  row,
  column,
  align,
  style,
}: {
  row: string
  column: string
  align?: 'start' | 'center' | 'end'
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{
        alignSelf: align,
        gridColumn: column,
        gridRow: row,
        height: 1,
        backgroundColor: 'white',
        ...style,
      }}
    />
  )
}

function VerticalLine({
  row,
  column,
  align,
  style,
}: {
  row: string
  column: string
  align?: 'start' | 'center' | 'end'
  style?: React.CSSProperties
}) {
  return (
    <div
      style={{
        justifySelf: align,
        gridColumn: column,
        gridRow: row,
        width: 1,
        backgroundColor: 'white',
        ...style,
      }}
    />
  )
}
