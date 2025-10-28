import React, { Suspense } from 'react'
import { type CSSObject, styled } from 'restyle'

import { BaseDirectoryContext } from '../Context.js'
import { computeDirectionalStyles } from '../../utils/compute-directional-styles.js'
import { getContext } from '../../utils/context.js'
import { getThemeColors } from '../../utils/get-theme.js'
import type { Languages } from '../../utils/get-language.js'
import { getConfig } from '../Config/ServerConfigContext.js'
import { CopyButton } from '../CopyButton/index.js'
import type { ContextValue } from './Context.js'
import { Context } from './Context.js'
import { LineNumbers } from './LineNumbers.js'
import { Pre } from './Pre.js'
import { Tokens } from './Tokens.js'
import type { AnnotationRenderers } from './Tokens.js'
import { Toolbar } from './Toolbar.js'
import {
  generateFocusedLinesGradient,
  generateHighlightedLinesGradient,
  getScrollContainerStyles,
} from './utils.js'
import { normalizeBaseDirectory } from '../../utils/normalize-base-directory.js'

export interface CodeBlockBaseProps {
  /** Name or path of the code block. Ordered file names will be stripped from the name e.g. `01.index.tsx` becomes `index.tsx`. */
  path?: string

  /** The base directory to use when analyzing the source code. This will read the local file system contents from the `baseDirectory` joined with the `path` prop instead of creating a virtual file. */
  baseDirectory?: string

  /** Language of the source code provided to the `Tokens` component. When `path` is defined, the file extension will be used to determine the language by default. */
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

  /** Annotation renderers used to transform inline or block annotations. */
  annotations?: AnnotationRenderers

  /** CSS styles to apply to code block elements. */
  css?: {
    container?: CSSObject
    toolbar?: CSSObject
    lineNumbers?: CSSObject
    token?: CSSObject
    popover?: CSSObject
    error?: CSSObject
    copyButton?: CSSObject
  }

  /** Class names to apply to code block elements. */
  className?: {
    container?: string
    toolbar?: string
    lineNumbers?: string
    token?: string
    popover?: string
    error?: string
    copyButton?: string
  }

  /** Styles to apply to code block elements. */
  style?: {
    container?: React.CSSProperties
    toolbar?: React.CSSProperties
    lineNumbers?: React.CSSProperties
    token?: React.CSSProperties
    popover?: React.CSSProperties
    error?: React.CSSProperties
    copyButton?: React.CSSProperties
  }
}

export type CodeBlockProps =
  | (CodeBlockBaseProps & {
      /** Pass a code string to highlight or override default rendering using `Tokens`, `LineNumbers`, and `Toolbar` components. */
      children: React.ReactNode
    })
  | (CodeBlockBaseProps & {
      /** Pass a code string to highlight or override default rendering using `Tokens`, `LineNumbers`, and `Toolbar` components. When omitted, the source text will be loaded from the file system using the `path` and `baseDirectory` props. */
      children?: React.ReactNode

      /** Name or path of the code block. Ordered file names will be stripped from the name e.g. `01.index.tsx` becomes `index.tsx`. */
      path: string
    })

/**
 * Displays syntax-highlighted source code with optional line numbers, toolbar,
 * copy-to-clipboard button, and error diagnostics.
 */
export const CodeBlock =
  process.env.NODE_ENV === 'development'
    ? CodeBlockWithFallback
    : CodeBlockAsync

/**
 * CodeBlock component used during development that wraps the async version in a
 * Suspense boundary with a fallback so we can render the code block as soon as possible.
 */
function CodeBlockWithFallback(props: CodeBlockProps) {
  const {
    shouldAnalyze = true,
    unfocusedLinesOpacity = 0.6,
    baseDirectory: baseDirectoryProp,
    ...restProps
  } = props
  const baseDirectoryContext = getContext(BaseDirectoryContext)
  const baseDirectory = normalizeBaseDirectory(
    baseDirectoryProp ?? baseDirectoryContext
  )

  if (typeof restProps.children !== 'string') {
    return (
      <CodeBlockAsync
        shouldAnalyze={shouldAnalyze}
        unfocusedLinesOpacity={unfocusedLinesOpacity}
        baseDirectory={baseDirectory}
        {...restProps}
      />
    )
  }

  const containerPadding = computeDirectionalStyles(
    'padding',
    '0.5lh',
    restProps.css?.container,
    restProps.style?.container
  )
  const shouldRenderToolbar = Boolean(
    restProps.showToolbar === undefined
      ? restProps.path || restProps.allowCopy
      : restProps.showToolbar
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
                  ...restProps.css?.container,
                  padding: 0,
                }
              : {}
          }
          className={
            shouldRenderToolbar ? restProps.className?.container : undefined
          }
          style={shouldRenderToolbar ? restProps.style?.container : undefined}
        >
          {shouldRenderToolbar && (
            <FallbackToolbar
              css={{ padding: containerPadding.all, ...restProps.css?.toolbar }}
              className={restProps.className?.toolbar}
              style={restProps.style?.toolbar}
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
              gridTemplateColumns: restProps.showLineNumbers
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
              ...(shouldRenderToolbar ? {} : restProps.css?.container),
              padding: 0,
            }}
            className={
              shouldRenderToolbar ? undefined : restProps.className?.container
            }
            style={shouldRenderToolbar ? undefined : restProps.style?.container}
          >
            {restProps.showLineNumbers && (
              <FallbackLineNumbers
                css={{
                  padding: containerPadding.all,
                  gridColumn: 1,
                  gridRow: '1 / -1',
                  width: '4ch',
                  backgroundPosition: 'inherit',
                  backgroundImage: 'inherit',
                  ...restProps.css?.lineNumbers,
                }}
                className={restProps.className?.lineNumbers}
                style={restProps.style?.lineNumbers}
              >
                {Array.from(
                  { length: restProps.children.split('\n').length },
                  (_, index) => index + 1
                ).join('\n')}
              </FallbackLineNumbers>
            )}

            <Code
              css={{
                gridColumn: restProps.showLineNumbers ? 2 : 1,
                padding: restProps.showLineNumbers
                  ? `${containerPadding.vertical} ${containerPadding.horizontal} 0 0`
                  : `${containerPadding.vertical} ${containerPadding.horizontal} 0`,
              }}
            >
              {restProps.children}
            </Code>
          </FallbackPre>
        </Container>
      }
    >
      <CodeBlockAsync
        shouldAnalyze={shouldAnalyze}
        unfocusedLinesOpacity={unfocusedLinesOpacity}
        baseDirectory={baseDirectory}
        {...restProps}
      />
    </Suspense>
  )
}

async function CodeBlockAsync({
  path,
  baseDirectory: baseDirectoryProp,
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
  annotations,
}: CodeBlockProps) {
  const containerPadding = computeDirectionalStyles(
    'padding',
    '0.5lh',
    css?.container,
    style?.container
  )
  const baseDirectoryContext = getContext(BaseDirectoryContext)
  const baseDirectory = normalizeBaseDirectory(
    baseDirectoryProp ?? baseDirectoryContext
  )
  const resolvers: any = {}
  resolvers.promise = new Promise<void>((resolve, reject) => {
    resolvers.resolve = resolve
    resolvers.reject = reject
  })
  const allowErrorsResolved = allowErrors ?? (showErrors ? true : undefined)
  const contextValue = {
    filePath: path,
    padding: containerPadding.all,
    allowErrors: allowErrorsResolved,
    showErrors,
    shouldAnalyze,
    shouldFormat,
    highlightedLines,
    language,
    baseDirectory,
    resolvers,
  } satisfies ContextValue
  let value: string | undefined

  if (typeof children === 'string') {
    value = children
  } else if (
    typeof children === 'object' &&
    children !== null &&
    'then' in children
  ) {
    value = (await children) as string
  } else if (!(children === undefined || children === null) && !path) {
    return <Context value={contextValue}>{children}</Context>
  }

  const config = await getConfig()
  const theme = await getThemeColors(config.theme)
  const shouldRenderToolbar = Boolean(
    showToolbar === undefined ? path || allowCopy : showToolbar
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
            allowCopy={allowCopy === undefined ? Boolean(path) : allowCopy}
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
                    error: css?.error,
                  }}
                  className={{
                    token: className?.token,
                    popover: className?.popover,
                    error: className?.error,
                  }}
                  style={{
                    token: style?.token,
                    popover: style?.popover,
                    error: style?.error,
                  }}
                  annotations={annotations}
                >
                  {value}
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
                  error: css?.error,
                }}
                className={{
                  token: className?.token,
                  popover: className?.popover,
                  error: className?.error,
                }}
                style={{
                  token: style?.token,
                  popover: style?.popover,
                  error: style?.error,
                }}
                annotations={annotations}
              >
                {value}
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
                right: containerPadding.horizontal,
                boxShadow: `inset 0 0 0 1px ${theme.panel.border}`,
                backgroundColor: theme.activityBar.background,
                color: theme.activityBar.foreground,
                borderRadius: 5,
                ...css?.copyButton,
              }}
              className={className?.copyButton}
              style={style?.copyButton}
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
export function parsePreProps(props: React.ComponentProps<'pre'>): {
  /** The code fence content. */
  children: string

  /** The language of the code block if defined e.g. `tsx`. */
  language?: Languages

  /** The path of the code block if defined e.g. `posts/markdown-guide.mdx`. */
  path?: string
} & Omit<React.ComponentProps<'pre'>, 'children' | 'className' | 'style'> {
  const { children, className, style, ...restProps } = props
  const code = children as React.ReactElement<{
    className?: string
    children: string
  }>
  const languageToken =
    code.props.className
      ?.split(/\s+/)
      .find((className) => className.startsWith(languageKey)) ?? ''

  let language: Languages = 'plaintext'
  let path: string | undefined

  if (languageToken) {
    const raw = languageToken.slice(languageLength)
    const dotIndex = raw.lastIndexOf('.')

    if (dotIndex !== -1) {
      path = raw
      language = raw.slice(dotIndex + 1) as Languages
    } else {
      // plain “tsx”, “js”, etc.
      language = raw as Languages
    }
  }

  return {
    children: code.props.children.trim(),
    language,
    path,
    ...restProps,
  }
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
  fontSize: 'inherit',
  display: 'flex',
  alignItems: 'center',
  gap: '0.25em',
  boxShadow: `inset 0 -1px 0 0 #666`,
  '&:before': {
    content: '""',
    display: 'block',
    width: '12ch',
    height: '1lh',
  },
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
