import React, { Suspense } from 'react'
import { type CSSObject, styled } from 'restyle'

import type { MDXComponents } from '../../mdx/index.js'
import { getSourceTextMetadata } from '../../project/client.js'
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

export type CodeBlockProps = {
  /** Pass a code string to highlight or override default rendering using `Tokens`, `LineNumbers`, and `Toolbar` components. */
  children: React.ReactNode | Promise<string>

  /** Name or path of the code block. Ordered file names will be stripped from the name e.g. `01.index.tsx` becomes `index.tsx`. */
  path?: string

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

  /** Whether or not to analyze the source code for type errors and provide quick information on hover. */
  shouldAnalyze?: boolean

  /** Whether or not to format the source code using `prettier` if installed. */
  shouldFormat?: boolean

  /** CSS styles to apply to code block elements. */
  css?: {
    container?: CSSObject
    toolbar?: CSSObject
    lineNumbers?: CSSObject
    token?: CSSObject
    popover?: CSSObject
    copyButton?: CSSObject
  }

  /** Class names to apply to code block elements. */
  className?: {
    container?: string
    toolbar?: string
    lineNumbers?: string
    token?: string
    popover?: string
    copyButton?: string
  }

  /** Styles to apply to code block elements. */
  style?: {
    container?: React.CSSProperties
    toolbar?: React.CSSProperties
    lineNumbers?: React.CSSProperties
    token?: React.CSSProperties
    popover?: React.CSSProperties
    copyButton?: React.CSSProperties
  }
}

/**
 * Renders a code block with tokenized source code, line numbers, and a toolbar.
 *
 * When targeting JavaScript or TypeScript languages, the provided source code is
 * type-checked and will throw errors that can be optionally displayed. Additionally,
 * the source code will be formatted using `prettier` if installed and quick info
 * is available when hovering symbols.
 */
export function CodeBlock({
  shouldAnalyze = true,
  unfocusedLinesOpacity = 0.6,
  ...props
}: CodeBlockProps) {
  if (typeof props.children !== 'string') {
    return (
      <CodeBlockAsync
        shouldAnalyze={shouldAnalyze}
        unfocusedLinesOpacity={unfocusedLinesOpacity}
        {...props}
      />
    )
  }

  const containerPadding = computeDirectionalStyles(
    'padding',
    '0.5lh',
    props.css?.container,
    props.style?.container
  )
  const shouldRenderToolbar = Boolean(
    props.showToolbar === undefined
      ? props.path || props.allowCopy
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
      <CodeBlockAsync
        shouldAnalyze={shouldAnalyze}
        unfocusedLinesOpacity={unfocusedLinesOpacity}
        {...props}
      />
    </Suspense>
  )
}

async function CodeBlockAsync({
  path: filePath,
  language,
  highlightedLines,
  focusedLines,
  unfocusedLinesOpacity,
  allowCopy,
  allowErrors,
  showErrors,
  showLineNumbers,
  showToolbar,
  shouldAnalyze,
  shouldFormat,
  children,
  className,
  css,
  style,
}: CodeBlockProps) {
  const containerPadding = computeDirectionalStyles(
    'padding',
    '0.5lh',
    css?.container,
    style?.container
  )
  const isString = typeof children === 'string'
  const isPromise =
    children &&
    typeof children === 'object' &&
    typeof (children as any).then === 'function'
  let value: any = ''

  // Wait for the children string to resolve if it is a Promise
  if (isPromise) {
    value = await children
  } else if (isString) {
    value = children
  }

  const metadata = await getSourceTextMetadata({
    value,
    language,
    filePath,
    shouldFormat,
  })
  const resolvers: any = {}
  resolvers.promise = new Promise<void>((resolve, reject) => {
    resolvers.resolve = resolve
    resolvers.reject = reject
  })
  const contextValue = {
    value: metadata.value,
    language: metadata.language,
    filePath: metadata.filePath,
    label: filePath ? metadata.label : undefined,
    padding: containerPadding.all,
    allowErrors,
    showErrors,
    shouldAnalyze,
    highlightedLines,
    resolvers,
  } satisfies ContextValue

  if (children) {
    if (!isString && !isPromise) {
      return (
        <Context value={contextValue}>
          <CopyButtonContextProvider value={metadata.value}>
            {children}
          </CopyButtonContextProvider>
        </Context>
      )
    }
  }

  const theme = await getThemeColors()
  const shouldRenderToolbar = Boolean(
    showToolbar === undefined ? filePath || allowCopy : showToolbar
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
          ...css?.container,
          padding: 0,
        } satisfies CSSObject,
        className: className?.container,
        style: style?.container,
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
            allowCopy={allowCopy === undefined ? Boolean(filePath) : allowCopy}
            css={{ padding: containerPadding.all, ...css?.toolbar }}
            className={className?.toolbar}
            style={style?.toolbar}
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
            ...(shouldRenderToolbar ? {} : css?.container),
            ...getThemeTokenVariables(),
            padding: 0,
          }}
          className={shouldRenderToolbar ? undefined : className?.container}
          style={shouldRenderToolbar ? undefined : style?.container}
        >
          {showLineNumbers ? (
            <>
              <LineNumbers
                className={className?.lineNumbers}
                css={{
                  padding: containerPadding.all,
                  gridColumn: 1,
                  gridRow: '1 / -1',
                  width: '4ch',
                  backgroundPosition: 'inherit',
                  backgroundImage: 'inherit',
                  ...css?.lineNumbers,
                }}
                style={style?.lineNumbers}
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
                    token: css?.token,
                    popover: css?.popover,
                  }}
                  className={{
                    token: className?.token,
                    popover: className?.popover,
                  }}
                  style={{
                    token: style?.token,
                    popover: style?.popover,
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
                  token: css?.token,
                  popover: css?.popover,
                }}
                className={{
                  token: className?.token,
                  popover: className?.popover,
                }}
                style={{
                  token: style?.token,
                  popover: style?.popover,
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
                right: '1ch',
                boxShadow: `inset 0 0 0 1px ${theme.panel.border}`,
                backgroundColor: theme.activityBar.background,
                color: theme.activityBar.foreground,
                borderRadius: 5,
                ...css?.copyButton,
              }}
              className={className?.copyButton}
              style={style?.copyButton}
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
  const fileName = code.props.className
    ?.split(' ')
    .find((className) => className.startsWith(languageKey))
  const language = fileName
    ? fileName.includes('.')
      ? fileName.split('.').pop()
      : fileName.slice(languageLength)
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
  minWidth: 'stretch',
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
