import { MDXComponents } from 'mdx/types'
import { CodeBlock, CodeInline } from 'renoun/components'
import { GeistMono } from 'geist/font/mono'

export function useMDXComponents() {
  return {
    Note: (props) => {
      return (
        <div
          css={{
            display: 'flex',
            alignItems: 'start',
            width: 'calc(100% + 2rem)',
            padding: '1.5rem 2rem 1.5rem 1rem',
            margin: '1rem -1rem',
            gap: '1rem',
            backgroundColor: '#1b487d',
            color: 'white',
            borderLeft: '3px solid #82aaff',
            borderRadius: 5,
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
          }}
        >
          <div
            css={{
              flexShrink: 0,
              display: 'flex',
              height: '1.5lh',
              width: '1.5lh',
              padding: '0.35lh',
              marginTop: '0.15lh',
              borderRadius: '100%',
              backgroundColor: '#1f3a5a',
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="100%"
              width="100%"
              viewBox="0 -960 960 960"
              fill="#deedff"
            >
              <path d="M320-240h320v-80H320v80zm0-160h320v-80H320v80zM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v480q0 33-23.5 56.5T720-80H240zm280-520v-200H240v640h480v-440H520zM240-800v200-200 640-640z" />
            </svg>
          </div>
          <p
            css={{
              fontSize: 'var(--font-size-body-2) !important',
              lineHeight: 'var(--line-height-body-2) !important',
              textWrap: 'pretty',
            }}
            {...props}
          />
        </div>
      )
    },
    code: (props) => {
      return (
        <CodeInline
          value={props.children as string}
          paddingY="0"
          css={{
            lineHeight: 1.2,
            overflowX: 'auto',
            color: '#82AAFF',
          }}
          className={GeistMono.className}
        />
      )
    },
    pre: (props) => {
      const { value, language } = CodeBlock.parsePreProps(props)
      return (
        <CodeBlock
          allowErrors
          value={value}
          language={language}
          css={{
            container: {
              fontSize: 'var(--font-size-code)',
              lineHeight: 'var(--line-height-code)',
              width: 'calc(100% + 2rem)',
              padding: '0.75rem 1rem',
              margin: '0 -1rem',
            },
            toolbar: {
              padding: '0.75rem 1rem',
            },
          }}
          className={{
            container: GeistMono.className,
          }}
        />
      )
    },
  } satisfies MDXComponents
}
