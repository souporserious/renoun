import { Markdown } from 'renoun'

export function Basic() {
  return (
    <Markdown>
      {`# Hello World

This is a **markdown** string that gets rendered as HTML.`}
    </Markdown>
  )
}

export function WithCustomComponents() {
  return (
    <Markdown
      components={{
        h1: (props) => (
          <h1
            {...props}
            style={{
              fontSize: '2rem',
              fontWeight: 'bold',
              marginBottom: '1rem',
            }}
          />
        ),
        p: (props) => (
          <p
            {...props}
            style={{
              lineHeight: 1.6,
              marginBottom: '0.5rem',
            }}
          />
        ),
        code: (props) => (
          <code
            {...props}
            style={{
              backgroundColor: 'oklab(0.3 -0.01 -0.04)',
              padding: '0.2rem 0.4rem',
              borderRadius: '0.25rem',
            }}
          />
        ),
      }}
    >
      {`# Hello World

This paragraph has custom styling applied through the \`components\` prop.

You can override any HTML element rendered from markdown.`}
    </Markdown>
  )
}
