import React, { Suspense } from 'react'
import { type CSSObject, styled } from 'restyle'
import type { MDXComponents } from 'mdx/types'
import 'server-only'

import { analyzeSourceText } from '../../project/index.js'
import { computeDirectionalStyles } from '../../utils/compute-directional-styles.js'
import { getThemeColors } from '../../utils/get-theme-colors.js'
import type { Languages } from '../../utils/get-tokens.js'
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

  /** Show or hide a button that copies the source code to the clipboard. */
  allowCopy?: boolean

  /** Whether or not to allow errors. Accepts a boolean or comma-separated list of allowed error codes. */
  allowErrors?: boolean | string

  /** Show or hide error diagnostics. */
  showErrors?: boolean

  /** Show or hide line numbers. */
  showLineNumbers?: boolean

  /** Show or hide the toolbar. */
  showToolbar?: boolean

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

  /** Overrides default rendering to allow full control over styles using `CodeBlock` components like `Tokens`, `LineNumbers`, and `Toolbar`. */
  children?: React.ReactNode
}

export type CodeBlockProps =
  | ({
      /** Source code to highlight. */
      value: string
    } & BaseCodeBlockProps)
  | ({
      /** Path to the source file on disk to highlight. */
      source: string

      /** The working directory for the `source`. */
      workingDirectory?: string
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
  ...props
}: CodeBlockProps) {
  const containerPadding = computeDirectionalStyles(
    'padding',
    '0.5lh',
    props.css?.container,
    props.style?.container
  )
  const hasValue = 'value' in props
  const hasSource = 'source' in props
  const options: any = {}

  if (hasValue) {
    options.value = props.value
  } else if (hasSource) {
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

  const { tokens, value, label } = await analyzeSourceText({
    filename,
    language,
    allowErrors,
    showErrors,
    ...options,
  })
  const contextValue = {
    filenameLabel: filename || hasSource ? label : undefined,
    padding: containerPadding.all,
    value,
    highlightedLines,
    tokens,
  } satisfies ContextValue

  if ('children' in props) {
    return (
      <Context value={contextValue}>
        <CopyButtonContextProvider value={value}>
          {props.children}
        </CopyButtonContextProvider>
      </Context>
    )
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
          backgroundColor: theme.background,
          color: theme.foreground,
          borderRadius: 5,
          boxShadow: `0 0 0 1px ${theme.panel.border}`,
          ...props.css?.container,
          padding: 0,
        } satisfies CSSObject,
        className: props.className?.container,
        style: props.style?.container,
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
            margin: 0,
            overflow: 'auto',
            backgroundColor: shouldRenderToolbar ? 'inherit' : theme.background,
            color: shouldRenderToolbar ? undefined : theme.foreground,
            borderRadius: shouldRenderToolbar ? 'inherit' : 5,
            boxShadow: shouldRenderToolbar
              ? undefined
              : `0 0 0 1px ${theme.panel.border}`,
            ...(highlightedLines
              ? {
                  '--h0': `rgba(0, 0, 0, 0)`,
                  '--h1': theme.editor.rangeHighlightBackground,
                  backgroundPosition: `0 ${containerPadding.top}`,
                  backgroundImage: highlightedLinesGradient,
                }
              : {}),
            ...(focusedLines
              ? {
                  '--m0': `rgba(0, 0, 0, ${unfocusedLinesOpacity})`,
                  '--m1': 'rgba(0, 0, 0, 1)',
                  maskPosition: `0 ${containerPadding.top}`,
                  maskImage: focusedLinesGradient,
                }
              : {}),
            ...(shouldRenderToolbar ? {} : props.css?.container),
            padding: 0,
          }}
          className={
            shouldRenderToolbar ? undefined : props.className?.container
          }
          style={props.style?.container}
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
                  padding: containerPadding.all,
                  gridColumn: 2,
                  paddingLeft: 0,
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
                />
              </Code>
            </>
          ) : (
            <Code css={{ padding: containerPadding.all, gridColumn: 1 }}>
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
              />
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
                value.includes('export { }')
                  ? value.split('\n').slice(0, -2).join('\n')
                  : value
              }
            />
          ) : null}
        </Pre>
      </Container>
    </Context>
  )
}

/** Renders a `pre` element with syntax highlighting, type information, and type checking. */
export function CodeBlock(props: CodeBlockProps) {
  if ('children' in props) {
    return <CodeBlockAsync {...props} />
  }

  const padding = props.style?.container?.padding ?? '0.5lh'

  return (
    <Suspense
      fallback={
        'value' in props && props.value ? (
          <FallbackPre
            css={{
              gridTemplateColumns: props.showLineNumbers
                ? 'auto 1fr'
                : undefined,
            }}
            className={props.className?.container}
            style={props.style?.container}
          >
            {props.showLineNumbers && (
              <FallbackLineNumbers
                css={{ padding }}
                className={props.className?.lineNumbers}
                style={props.style?.lineNumbers}
              >
                {Array.from(
                  { length: props.value.split('\n').length },
                  (_, index) => index + 1
                ).join('\n')}
              </FallbackLineNumbers>
            )}
            <FallbackCode
              css={{
                padding,
                gridColumn: props.showLineNumbers ? 2 : 1,
              }}
            >
              {props.value}
            </FallbackCode>
          </FallbackPre>
        ) : null
      }
    >
      <CodeBlockAsync {...props} />
    </Suspense>
  )
}

const languageKey = 'language-'
const languageLength = languageKey.length

CodeBlock.parsePreProps = (
  props: React.ComponentProps<NonNullable<MDXComponents['pre']>>
) => {
  const code = props.children as React.ReactElement<{
    className: `language-${string}`
    children: string
  }>
  const languageClassName = code.props.className
    .split(' ')
    .find((className) => className.startsWith(languageKey))

  return {
    value: code.props.children.trim(),
    language: (languageClassName
      ? languageClassName.slice(languageLength)
      : 'plain') as Languages,
  }
}

const StyledContainer = styled('div')

const Code = styled('code', {
  gridRow: '1 / -1',
  display: 'block',
  width: 'max-content',
  backgroundColor: 'transparent',
})

const FallbackPre = styled('pre', {
  display: 'grid',
  whiteSpace: 'pre',
  wordWrap: 'break-word',
  margin: 0,
  overflow: 'auto',
  borderRadius: 5,
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
})
