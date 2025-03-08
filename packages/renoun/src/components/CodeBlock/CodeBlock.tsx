import React, { Suspense } from 'react'
import { type CSSObject, styled } from 'restyle'

import type { MDXComponents } from '../../mdx/index.js'
import { analyzeSourceText } from '../../project/client.js'
import { computeDirectionalStyles } from '../../utils/compute-directional-styles.js'
import {
  getThemeColors,
  getThemeTokenVariables,
} from '../../utils/get-theme.js'
import type { Languages } from '../../utils/get-language.js'
import type { ContextValue } from './Context.js'
import { Context } from './Context.js'
import { CopyButtonContextProvider } from './contexts.js'
import { CopyButton } from './CopyButton.js'
import { LineNumbers } from './LineNumbers.js'
import { Pre } from './Pre.js'
import { Tokens } from './Tokens.js'
import { Toolbar } from './Toolbar.js'
import {
  generateFocusedLinesGradient,
  generateHighlightedLinesGradient,
  getScrollContainerStyles,
} from './utils.js'

export type BaseCodeBlockProps = {
  /** Name or path of the code block. Ordered filenames will be stripped from the name e.g. `01.index.tsx` becomes `index.tsx`. */
  filename?: string

  /** Language of the source code. When used with `source`, the file extension will be used by default. */
  language?: Languages

  /** A string of comma separated lines and ranges to highlight e.g. `'1, 3-5, 7'`. */
  highlightedLines?: string

  /** A string of comma separated lines and ranges to focus e.g. `'6-8, 12'`. */
  focusedLines?: string

  /** Opacity of unfocused lines when using `focusedLines`. */
  unfocusedLinesOpacity?: number

  /** Show or hide a button that copies the source code to the clipboard. Accepts a boolean or a string that will be copied. */
  allowCopy?: boolean | string

  /** Whether or not to allow errors. Accepts a boolean or comma-separated list of allowed error codes. */
  allowErrors?: boolean | string

  /** Show or hide error diagnostics. */
  showErrors?: boolean

  /** Show or hide line numbers. */
  showLineNumbers?: boolean

  /** Show or hide the toolbar. */
  showToolbar?: boolean

  /** Whether or not to format the source code using `prettier` if installed. */
  shouldFormat?: boolean

  /** CSS styles to apply to code block elements. */
  css?: {
    container?: CSSObject
    toolbar?: CSSObject
    lineNumbers?: CSSObject
    token?: CSSObject
    popover?: CSSObject
  }

  /** Class names to apply to code block elements. */
  className?: {
    container?: string
    toolbar?: string
    lineNumbers?: string
    token?: string
    popover?: string
  }

  /** Styles to apply to code block elements. */
  style?: {
    container?: React.CSSProperties
    toolbar?: React.CSSProperties
    lineNumbers?: React.CSSProperties
    token?: React.CSSProperties
    popover?: React.CSSProperties
  }
}

export type CodeBlockProps =
  | ({
      /** Pass a code string to highlight or override default rendering using `Tokens`, `LineNumbers`, and `Toolbar` components. */
      children: React.ReactNode | Promise<string>
    } & BaseCodeBlockProps)
  | ({
      /** Path to the source file on disk to highlight. */
      source: string

      /** The working directory for the `source`. */
      workingDirectory?: string

      /** Override default rendering using `Tokens`, `LineNumbers`, and `Toolbar` components. */
      children?: React.ReactNode | Promise<string>
    } & BaseCodeBlockProps)

async function CodeBlockAsync({
  filename,
  language,
  highlightedLines,
  focusedLines,
  unfocusedLinesOpacity = 0.6,
  allowCopy,
  allowErrors,
  showErrors,
  showLineNumbers,
  showToolbar,
  shouldFormat,
  ...props
}: CodeBlockProps) {
  const containerPadding = computeDirectionalStyles(
    'padding',
    '0.5lh',
    props.css?.container,
    props.style?.container
  )
  const isString = typeof props.children === 'string'
  const isPromise =
    props.children &&
    typeof props.children === 'object' &&
    typeof (props.children as any).then === 'function'
  const hasSource = 'source' in props
  const options: any = {}

  if (hasSource) {
    options.source = props.source

    if (props.workingDirectory) {
      if (URL.canParse(props.workingDirectory)) {
        const { pathname } = new URL(props.workingDirectory)
        options.workingDirectory = pathname.slice(0, pathname.lastIndexOf('/'))
      } else {
        options.workingDirectory = props.workingDirectory
      }
    }
  }
  // Wait for the children string to resolve if it is a Promise
  else if (isPromise) {
    options.value = await props.children
  } else if (isString) {
    options.value = props.children
  }

  const metadata = await analyzeSourceText({
    filename,
    language,
    allowErrors,
    showErrors,
    shouldFormat,
    ...options,
  })
  const resolvers = Promise.withResolvers<void>()
  const contextValue = {
    filename: metadata.filename,
    filenameLabel: filename || hasSource ? metadata.filenameLabel : undefined,
    language: metadata.language,
    value: metadata.value,
    padding: containerPadding.all,
    highlightedLines,
    resolvers,
  } satisfies ContextValue

  if (props.children) {
    if (!isString && !isPromise) {
      return (
        <Context value={contextValue}>
          <CopyButtonContextProvider value={metadata.value}>
            {props.children}
          </CopyButtonContextProvider>
        </Context>
      )
    }
  }

  const theme = await getThemeColors()
  const shouldRenderToolbar = Boolean(
    showToolbar === undefined ? filename || hasSource || allowCopy : showToolbar
  )
  const highlightedLinesGradient = highlightedLines
    ? generateHighlightedLinesGradient(highlightedLines)
    : undefined
  const focusedLinesGradient = focusedLines
    ? generateFocusedLinesGradient(focusedLines)
    : undefined
  const Container = shouldRenderToolbar ? StyledContainer : React.Fragment
  const containerProps = shouldRenderToolbar
    ? {
        css: {
          borderRadius: 5,
          boxShadow: `0 0 0 1px ${theme.panel.border}`,
          backgroundColor: theme.background,
          color: theme.foreground,
          ...props.css?.container,
          padding: 0,
        } satisfies CSSObject,
        className: props.className?.container,
        style: props.style?.container,
      }
    : {}
  const focusedLinesStyles = focusedLines
    ? {
        '--m0': `rgba(0, 0, 0, ${unfocusedLinesOpacity})`,
        '--m1': 'rgba(0, 0, 0, 1)',
        maskPosition: `0 ${containerPadding.top}`,
        maskImage: focusedLinesGradient,
      }
    : {}

  return (
    <Context value={contextValue}>
      <Container {...containerProps}>
        {shouldRenderToolbar ? (
          <Toolbar
            allowCopy={allowCopy === undefined ? Boolean(filename) : allowCopy}
            css={{ padding: containerPadding.all, ...props.css?.toolbar }}
            className={props.className?.toolbar}
            style={props.style?.toolbar}
          />
        ) : null}
        <Pre
          css={{
            WebkitTextSizeAdjust: 'none',
            textSizeAdjust: 'none',
            position: 'relative',
            whiteSpace: 'pre',
            wordWrap: 'break-word',
            display: 'grid',
            gridTemplateColumns: showLineNumbers ? 'auto 1fr' : undefined,
            gridAutoRows: 'max-content',
            margin: 0,
            backgroundColor: shouldRenderToolbar ? 'inherit' : theme.background,
            color: shouldRenderToolbar ? undefined : theme.foreground,
            borderRadius: shouldRenderToolbar ? 'inherit' : 5,
            boxShadow: shouldRenderToolbar
              ? undefined
              : `0 0 0 1px ${theme.panel.border}`,
            ...getScrollContainerStyles({
              paddingBottom: containerPadding.bottom,
              color: theme.scrollbarSlider.hoverBackground,
            }),
            ...(highlightedLines
              ? {
                  '--h0': `rgba(0, 0, 0, 0)`,
                  '--h1': theme.editor.rangeHighlightBackground,
                  backgroundPosition: `0 ${containerPadding.top}`,
                  backgroundImage: highlightedLinesGradient,
                }
              : {}),
            ...(shouldRenderToolbar ? {} : props.css?.container),
            ...getThemeTokenVariables(),
            padding: 0,
          }}
          className={
            shouldRenderToolbar ? undefined : props.className?.container
          }
          style={shouldRenderToolbar ? undefined : props.style?.container}
        >
          {showLineNumbers ? (
            <>
              <LineNumbers
                className={props.className?.lineNumbers}
                css={{
                  padding: containerPadding.all,
                  gridColumn: 1,
                  gridRow: '1 / -1',
                  width: '4ch',
                  backgroundPosition: 'inherit',
                  backgroundImage: 'inherit',
                  ...props.css?.lineNumbers,
                }}
                style={props.style?.lineNumbers}
              />
              <Code
                css={{
                  gridColumn: 2,
                  padding: `${containerPadding.vertical} ${containerPadding.horizontal} 0 0`,
                  ...focusedLinesStyles,
                }}
              >
                <Tokens
                  css={{
                    token: props.css?.token,
                    popover: props.css?.popover,
                  }}
                  className={{
                    token: props.className?.token,
                    popover: props.className?.popover,
                  }}
                  style={{
                    token: props.style?.token,
                    popover: props.style?.popover,
                  }}
                >
                  {metadata.value}
                </Tokens>
              </Code>
            </>
          ) : (
            <Code
              css={{
                gridColumn: 1,
                padding: `${containerPadding.vertical} ${containerPadding.horizontal} 0`,
                ...focusedLinesStyles,
              }}
            >
              <Tokens
                css={{
                  token: props.css?.token,
                  popover: props.css?.popover,
                }}
                className={{
                  token: props.className?.token,
                  popover: props.className?.popover,
                }}
                style={{
                  token: props.style?.token,
                  popover: props.style?.popover,
                }}
              >
                {metadata.value}
              </Tokens>
            </Code>
          )}
          {allowCopy !== false && !shouldRenderToolbar ? (
            <CopyButton
              css={{
                placeSelf: 'start end',
                gridColumn: showLineNumbers ? 2 : 1,
                gridRow: '1 / -1',
                position: 'sticky',
                top: containerPadding.top,
                right: containerPadding.right,
                boxShadow: `0 0 0 1px ${theme.panel.border}`,
                backgroundColor: theme.activityBar.background,
                color: theme.activityBar.foreground,
                borderRadius: 5,
              }}
              value={
                metadata.value.includes('export { }')
                  ? metadata.value.split('\n').slice(0, -2).join('\n')
                  : metadata.value
              }
            />
          ) : null}
        </Pre>
      </Container>
    </Context>
  )
}

/** Renders a  with syntax highlighting, type information, and type checking. */
export function CodeBlock(props: CodeBlockProps) {
  if (typeof props.children !== 'string') {
    return <CodeBlockAsync {...props} />
  }

  const containerPadding = computeDirectionalStyles(
    'padding',
    '0.5lh',
    props.css?.container,
    props.style?.container
  )
  const shouldRenderToolbar = Boolean(
    props.showToolbar === undefined
      ? props.filename || ('source' in props && props.source) || props.allowCopy
      : props.showToolbar
  )
  const Container = shouldRenderToolbar ? StyledContainer : React.Fragment

  return (
    <Suspense
      fallback={
        <Container
          css={
            shouldRenderToolbar
              ? {
                  borderRadius: 5,
                  boxShadow: '0 0 0 1px #666',
                  ...props.css?.container,
                  padding: 0,
                }
              : {}
          }
          className={
            shouldRenderToolbar ? props.className?.container : undefined
          }
          style={shouldRenderToolbar ? props.style?.container : undefined}
        >
          {shouldRenderToolbar && (
            <FallbackToolbar
              css={{ padding: containerPadding.all, ...props.css?.toolbar }}
              className={props.className?.toolbar}
              style={props.style?.toolbar}
            />
          )}
          <FallbackPre
            css={{
              WebkitTextSizeAdjust: 'none',
              textSizeAdjust: 'none',
              position: 'relative',
              whiteSpace: 'pre',
              wordWrap: 'break-word',
              display: 'grid',
              gridAutoRows: 'max-content',
              gridTemplateColumns: props.showLineNumbers
                ? 'auto 1fr'
                : undefined,
              margin: 0,
              backgroundColor: shouldRenderToolbar ? 'inherit' : 'transparent',
              color: shouldRenderToolbar ? undefined : 'inherit',
              borderRadius: shouldRenderToolbar ? 'inherit' : 5,
              boxShadow: shouldRenderToolbar ? undefined : '0 0 0 1px #666',
              ...getScrollContainerStyles({
                paddingBottom: containerPadding.bottom,
              }),
              ...(shouldRenderToolbar ? {} : props.css?.container),
              padding: 0,
            }}
            className={
              shouldRenderToolbar ? undefined : props.className?.container
            }
            style={shouldRenderToolbar ? undefined : props.style?.container}
          >
            {props.showLineNumbers && (
              <FallbackLineNumbers
                css={{
                  padding: containerPadding.all,
                  gridColumn: 1,
                  gridRow: '1 / -1',
                  width: '4ch',
                  backgroundPosition: 'inherit',
                  backgroundImage: 'inherit',
                  ...props.css?.lineNumbers,
                }}
                className={props.className?.lineNumbers}
                style={props.style?.lineNumbers}
              >
                {Array.from(
                  { length: props.children.split('\n').length },
                  (_, index) => index + 1
                ).join('\n')}
              </FallbackLineNumbers>
            )}

            <FallbackCode
              css={{
                gridColumn: props.showLineNumbers ? 2 : 1,
                padding: props.showLineNumbers
                  ? `${containerPadding.vertical} ${containerPadding.horizontal} 0 0`
                  : `${containerPadding.vertical} ${containerPadding.horizontal} 0`,
              }}
            >
              {props.children}
            </FallbackCode>
          </FallbackPre>
        </Container>
      }
    >
      <CodeBlockAsync {...props} />
    </Suspense>
  )
}

const languageKey = 'language-'
const languageLength = languageKey.length

/** Parses the props of an MDX `pre` element for passing to `CodeBlock`. */
export function parsePreProps({
  children,
  ...props
}: React.ComponentProps<NonNullable<MDXComponents['pre']>>) {
  const code = children as React.ReactElement<{
    className: `language-${string}`
    children: string
  }>
  const filename = code.props.className
    ?.split(' ')
    .find((className) => className.startsWith(languageKey))
  const language = filename
    ? filename.includes('.')
      ? filename.split('.').pop()
      : filename.slice(languageLength)
    : 'plaintext'

  return {
    children: code.props.children.trim(),
    language,
    ...props,
  } satisfies {
    value: string
    language?: Languages
  } & Omit<React.ComponentProps<NonNullable<MDXComponents['pre']>>, 'children'>
}

const StyledContainer = styled('div')

const Code = styled('code', {
  gridRow: '1 / -1',
  display: 'block',
  width: 'max-content',
  backgroundColor: 'transparent',
})

const FallbackToolbar = styled('div', {
  padding: '0.5lh',
  boxShadow: `inset 0 -1px 0 0 #666`,
})

const FallbackPre = styled('pre', {
  display: 'grid',
  whiteSpace: 'pre',
  wordWrap: 'break-word',
  margin: 0,
})

const FallbackLineNumbers = styled('span', {
  position: 'sticky',
  left: 0,
  zIndex: 1,
  textAlign: 'right',
  userSelect: 'none',
  whiteSpace: 'pre',
  gridColumn: 1,
  gridRow: '1 / -1',
  width: '4ch',
  backgroundColor: 'inherit',
})

const FallbackCode = styled('code', {
  display: 'block',
  width: 'max-content',
  backgroundColor: 'transparent',
})
