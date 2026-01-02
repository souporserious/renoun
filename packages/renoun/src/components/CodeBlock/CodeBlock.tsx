import React, { Suspense } from 'react'
import { styled, type CSSObject } from 'restyle'

import { BaseDirectoryContext } from '../Context.tsx'
import { computeDirectionalStyles } from '../../utils/compute-directional-styles.ts'
import { getContext } from '../../utils/context.tsx'
import { getThemeColors } from '../../utils/get-theme.ts'
import type { Languages } from '../../utils/get-language.ts'
import { getConfig } from '../Config/ServerConfigContext.tsx'
import { CopyButton } from '../CopyButton/index.ts'
import type { ContextValue } from './Context.tsx'
import { Context } from './Context.tsx'
import { LineNumbers, type LineNumbersProps } from './LineNumbers.tsx'
import { Pre } from './Pre.tsx'
import { Tokens, type TokensProps } from './Tokens.tsx'
import type { AnnotationRenderers } from './Tokens.tsx'
import { Toolbar, type ToolbarProps } from './Toolbar.tsx'
import {
  generateFocusedLinesGradient,
  generateHighlightedLinesGradient,
  getScrollContainerStyles,
} from './utils.ts'
import { normalizeBaseDirectory } from '../../utils/normalize-base-directory.ts'
import { pathLikeToString, type PathLike } from '../../utils/path.ts'
import {
  normalizeSlotComponents,
  type SlotComponentOrProps,
} from '../../utils/slot-components.ts'

export interface CodeBlockBaseProps {
  /** Name or path of the code block. Ordered file names will be stripped from the name e.g. `01.index.tsx` becomes `index.tsx`. */
  path?: PathLike

  /** The base directory to use when analyzing the source code. This will read the local file system contents from the `baseDirectory` joined with the `path` prop instead of creating a virtual file. */
  baseDirectory?: PathLike

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

  /** Override the default component renderers. */
  components?: Partial<CodeBlockComponentOverrides>
}

export interface CodeBlockComponentOverrides {
  Container: SlotComponentOrProps<
    React.ComponentProps<'div'> & { css?: CSSObject }
  >
  Toolbar: SlotComponentOrProps<ToolbarProps>
  Pre: SlotComponentOrProps<React.ComponentProps<'pre'> & { css?: CSSObject }>
  LineNumbers: SlotComponentOrProps<LineNumbersProps>
  Code: SlotComponentOrProps<React.ComponentProps<'code'> & { css?: CSSObject }>
  Tokens: SlotComponentOrProps<TokensProps>
  CopyButton: SlotComponentOrProps<React.ComponentProps<typeof CopyButton>>
}

export interface CodeBlockComponents {
  Container: React.ComponentType<
    React.ComponentProps<'div'> & { css?: CSSObject }
  >
  Toolbar: React.ComponentType<ToolbarProps>
  Pre: React.ComponentType<React.ComponentProps<'pre'> & { css?: CSSObject }>
  LineNumbers: React.ComponentType<LineNumbersProps>
  Code: React.ComponentType<React.ComponentProps<'code'> & { css?: CSSObject }>
  Tokens: React.ComponentType<TokensProps>
  CopyButton: React.ComponentType<React.ComponentProps<typeof CopyButton>>
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
      path: PathLike
    })

const StyledContainer = styled('div')

const Code = styled('code', {
  gridRow: '1 / -1',
  display: 'block',
  width: 'max-content',
  minWidth: 'stretch',
  backgroundColor: 'transparent',
})

/**
 * Displays syntax-highlighted source code with optional line numbers, toolbar,
 * copy-to-clipboard button, and error diagnostics.
 */
export const CodeBlock =
  process.env.NODE_ENV === 'development'
    ? CodeBlockWithFallback
    : CodeBlockAsync

const defaultComponents: CodeBlockComponents = {
  Container: StyledContainer,
  Toolbar,
  Pre,
  LineNumbers,
  Code,
  Tokens,
  CopyButton,
}

function normalizeComponents(
  overrides: Partial<CodeBlockComponentOverrides> | undefined
): CodeBlockComponents {
  return normalizeSlotComponents(defaultComponents, overrides as any)
}

/**
 * CodeBlock component used during development that wraps the async version in a
 * Suspense boundary with a fallback so the code block renders as soon as possible.
 */
function CodeBlockWithFallback(
  props: CodeBlockProps | React.ComponentProps<'pre'>
) {
  const {
    shouldAnalyze = true,
    unfocusedLinesOpacity = 0.6,
    baseDirectory: baseDirectoryProp,
    ...restProps
  } = normalizeCodeBlockProps(props)
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

  const containerPadding = computeDirectionalStyles('padding', '0.5lh')
  const shouldRenderToolbar = Boolean(
    restProps.showToolbar === undefined
      ? restProps.path || restProps.allowCopy
      : restProps.showToolbar
  )

  const components: CodeBlockComponents = {
    ...normalizeComponents(restProps.components),
  }
  const Container = components.Container

  return (
    <Suspense
      fallback={
        <Container
          css={
            shouldRenderToolbar
              ? {
                  borderRadius: 5,
                  boxShadow: '0 0 0 1px #666',
                  padding: 0,
                }
              : undefined
          }
        >
          {shouldRenderToolbar && (
            <FallbackToolbar css={{ padding: containerPadding.all }} />
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
              padding: 0,
            }}
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
                }}
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
                  ? `${containerPadding.vertical} ${containerPadding.horizontal} ${containerPadding.vertical} 0`
                  : `${containerPadding.vertical} ${containerPadding.horizontal}`,
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

async function CodeBlockAsync(
  props: CodeBlockProps | React.ComponentProps<'pre'>
) {
  const {
    path: pathProp,
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
    annotations,
    components: componentsProp = {},
  } = normalizeCodeBlockProps(props)
  const components: CodeBlockComponents = {
    ...normalizeComponents(componentsProp),
  }
  const containerPadding = computeDirectionalStyles('padding', '0.5lh')
  const baseDirectoryContext = getContext(BaseDirectoryContext)
  const baseDirectory = normalizeBaseDirectory(
    baseDirectoryProp ?? baseDirectoryContext
  )
  const path = pathProp ? pathLikeToString(pathProp) : pathProp
  const resolvers: any = {}
  resolvers.promise = new Promise<void>((resolve, reject) => {
    resolvers.resolve = resolve
    resolvers.reject = reject
  })
  const contextValue = {
    filePath: path,
    padding: containerPadding.all,
    allowErrors: allowErrors === undefined ? showErrors : allowErrors,
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
  const Container = components.Container
  const containerProps = {
    css: shouldRenderToolbar
      ? ({
          borderRadius: 5,
          boxShadow: `0 0 0 1px ${theme.panel.border}`,
          backgroundColor: theme.background,
          color: theme.foreground,
          padding: 0,
        } satisfies CSSObject)
      : undefined,
  }
  const focusedLinesStyles = (
    focusedLines
      ? {
          '--m0': `rgba(0, 0, 0, ${unfocusedLinesOpacity})`,
          '--m1': 'rgba(0, 0, 0, 1)',
          maskPosition: `0 ${containerPadding.top}`,
          maskImage: focusedLinesGradient,
        }
      : {}
  ) as React.CSSProperties
  const preStyles = {
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
    ...(highlightedLines
      ? {
          '--h0': `rgba(0, 0, 0, 0)`,
          '--h1': theme.editor.rangeHighlightBackground,
          backgroundPosition: `0 ${containerPadding.top}`,
          backgroundImage: highlightedLinesGradient,
        }
      : {}),
    padding: 0,
  } as React.CSSProperties
  const scrollContainerStyles = getScrollContainerStyles({
    color: theme.scrollbarSlider.hoverBackground,
  })
  const preProps =
    components.Pre === Pre
      ? { css: { ...preStyles, ...scrollContainerStyles } }
      : { style: preStyles }

  const toolbarProps =
    components.Toolbar === Toolbar
      ? ({
          css: { padding: containerPadding.all },
        } satisfies Partial<ToolbarProps>)
      : ({
          style: { padding: containerPadding.all },
        } satisfies Partial<ToolbarProps>)

  const lineNumbersLayout = {
    padding: containerPadding.all,
    gridColumn: 1,
    gridRow: '1 / -1',
    width: '4ch',
    backgroundPosition: 'inherit',
    backgroundImage: 'inherit',
  }
  const lineNumbersProps =
    components.LineNumbers === LineNumbers
      ? ({ css: lineNumbersLayout } satisfies Partial<LineNumbersProps>)
      : ({ style: lineNumbersLayout } satisfies Partial<LineNumbersProps>)

  const copyButtonLayout = {
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
  }
  const copyButtonProps =
    components.CopyButton === CopyButton
      ? ({ css: copyButtonLayout } as React.ComponentProps<typeof CopyButton>)
      : ({ style: copyButtonLayout } as React.ComponentProps<typeof CopyButton>)

  return (
    <Context value={contextValue}>
      <Container {...containerProps}>
        {shouldRenderToolbar ? (
          <components.Toolbar
            allowCopy={allowCopy === undefined ? Boolean(path) : allowCopy}
            {...toolbarProps}
          />
        ) : null}
        <components.Pre {...preProps}>
          {showLineNumbers ? (
            <>
              <components.LineNumbers {...lineNumbersProps} />
              <components.Code
                {...(components.Code === Code
                  ? {
                      css: {
                        gridColumn: 2,
                        padding: `${containerPadding.vertical} ${containerPadding.horizontal}`,
                        paddingInlineStart: 0,
                        ...(focusedLinesStyles as any),
                      } satisfies CSSObject,
                    }
                  : {
                      style: {
                        gridColumn: 2,
                        padding: `${containerPadding.vertical} ${containerPadding.horizontal}`,
                        paddingInlineStart: 0,
                        ...focusedLinesStyles,
                      },
                    })}
              >
                <components.Tokens
                  path={path}
                  baseDirectory={baseDirectory}
                  language={language}
                  allowErrors={allowErrors}
                  showErrors={showErrors}
                  annotations={annotations}
                >
                  {value}
                </components.Tokens>
              </components.Code>
            </>
          ) : (
            <components.Code
              {...(components.Code === Code
                ? {
                    css: {
                      gridColumn: 1,
                      padding: `${containerPadding.vertical} ${containerPadding.horizontal}`,
                      ...(focusedLinesStyles as any),
                    } satisfies CSSObject,
                  }
                : {
                    style: {
                      gridColumn: 1,
                      padding: `${containerPadding.vertical} ${containerPadding.horizontal}`,
                      ...focusedLinesStyles,
                    },
                  })}
            >
              <components.Tokens
                path={path}
                baseDirectory={baseDirectory}
                language={language}
                allowErrors={allowErrors}
                showErrors={showErrors}
                annotations={annotations}
              >
                {value}
              </components.Tokens>
            </components.Code>
          )}
          {allowCopy !== false && !shouldRenderToolbar ? (
            <components.CopyButton {...copyButtonProps} />
          ) : null}
        </components.Pre>
      </Container>
    </Context>
  )
}

const languageKey = 'language-'
const languageLength = languageKey.length

function isPreElementProps(
  props: CodeBlockProps | React.ComponentProps<'pre'>
): props is React.ComponentProps<'pre'> {
  const value =
    'className' in props
      ? (props as React.ComponentProps<'pre'>).className
      : undefined
  return typeof value === 'string' || Array.isArray(value)
}

function normalizeCodeBlockProps(
  props: CodeBlockProps | React.ComponentProps<'pre'>
): CodeBlockProps {
  if (!isPreElementProps(props)) {
    return props as CodeBlockProps
  }

  const { children, className, style, ...restProps } = props
  const code = children as React.ReactElement<{
    className?: string
    children: string
  }>
  const languageToken =
    code?.props?.className
      ?.split(/\s+/)
      .find((token) => token.startsWith(languageKey)) ?? ''

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
    ...restProps,
    children:
      typeof code?.props?.children === 'string'
        ? code.props.children.trim()
        : '',
    language,
    path,
  } as CodeBlockProps
}

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
