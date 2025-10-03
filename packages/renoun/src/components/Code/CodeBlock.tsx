import React, { Suspense } from 'react'
import { css, styled } from 'restyle'

import { BaseDirectoryContext } from '../Context.js'
import { getContext } from '../../utils/context.js'
import {
  getThemeColors,
  getThemeTokenVariables,
} from '../../utils/get-theme.js'
import type { Languages } from '../../utils/get-language.js'
import { getConfig } from '../Config/ServerConfigContext.js'
import { CopyButton } from '../CopyButton/index.js'
import type { ContextValue } from './Context.js'
import { Context } from './Context.js'
import type { LineNumbersProps } from './LineNumbers.js'
import { LineNumbers } from './LineNumbers.js'
import { Pre } from './Pre.js'
import type { TokensProps } from './Tokens.js'
import { Tokens } from './Tokens.js'
import type { ToolbarProps } from './Toolbar.js'
import { Toolbar } from './Toolbar.js'
import {
  generateFocusedLinesGradient,
  generateHighlightedLinesGradient,
  getScrollContainerStyles,
} from './utils.js'

interface PaddingConfig {
  top: string
  right: string
  bottom: string
  left: string
  horizontal: string
  vertical: string
  all: string
}

export interface CodeBlockContainerProps {
  shouldRenderToolbar: boolean
  padding: PaddingConfig
  theme: Awaited<ReturnType<typeof getThemeColors>>
  className?: string
  children: React.ReactNode
}

export interface CodeBlockPreProps {
  shouldRenderToolbar: boolean
  showLineNumbers: boolean
  padding: PaddingConfig
  theme: Awaited<ReturnType<typeof getThemeColors>>
  highlightedLines?: string
  focusedLines?: string
  className: string
  children: React.ReactNode
}

export interface CodeBlockCodeProps {
  showLineNumbers: boolean
  padding: PaddingConfig
  className: string
  children: React.ReactNode
}

export interface CodeBlockComponents {
  /** Custom renderer for the outer container element. */
  Container?: React.ComponentType<CodeBlockContainerProps>

  /** Custom renderer for the `pre` element. */
  Pre?: React.ComponentType<CodeBlockPreProps>

  /** Custom renderer for the `code` element. */
  Code?: React.ComponentType<CodeBlockCodeProps>

  /** Custom renderer for the line numbers column. */
  LineNumbers?: React.ComponentType<LineNumbersProps>

  /** Custom renderer for highlighted tokens. */
  Tokens?: React.ComponentType<TokensProps>

  /** Custom renderer for the toolbar displayed above the block. */
  Toolbar?: React.ComponentType<ToolbarProps>

  /** Custom renderer for the copy button when the toolbar is hidden. */
  CopyButton?: React.ComponentType<React.ComponentProps<typeof CopyButton>>
}

export interface CodeBlockProps {
  /** Pass a code string to highlight or override default rendering using `Tokens`, `LineNumbers`, and `Toolbar` components. */
  children: React.ReactNode

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

  /** Override internal sub-components with custom implementations. */
  components?: CodeBlockComponents
}

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
    components,
    shouldAnalyze = true,
    unfocusedLinesOpacity = 0.6,
    baseDirectory: baseDirectoryProp,
    ...restProps
  } = props
  const baseDirectoryContext = getContext(BaseDirectoryContext)
  const baseDirectory = baseDirectoryProp ?? baseDirectoryContext

  if (typeof restProps.children !== 'string') {
    return (
      <CodeBlockAsync
        shouldAnalyze={shouldAnalyze}
        unfocusedLinesOpacity={unfocusedLinesOpacity}
        baseDirectory={baseDirectory}
        components={components}
        {...restProps}
      />
    )
  }

  const PADDING_X = 'var(--padding-x, 0.5lh)'
  const PADDING_Y = 'var(--padding-y, 0.5lh)'
  const containerPadding = {
    top: PADDING_Y,
    right: PADDING_X,
    bottom: PADDING_Y,
    left: PADDING_X,
    horizontal: PADDING_X,
    vertical: PADDING_Y,
    all: `${PADDING_Y} ${PADDING_X}`,
  }
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
                  padding: 0,
                }
              : {}
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
              ...getScrollContainerStyles({
                paddingBottom: containerPadding.bottom,
              }),
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

            <FallbackCode
              css={{
                gridColumn: restProps.showLineNumbers ? 2 : 1,
                padding: restProps.showLineNumbers
                  ? `${containerPadding.vertical} ${containerPadding.horizontal} 0 0`
                  : `${containerPadding.vertical} ${containerPadding.horizontal} 0`,
              }}
            >
              {restProps.children}
            </FallbackCode>
          </FallbackPre>
        </Container>
      }
    >
      <CodeBlockAsync
        shouldAnalyze={shouldAnalyze}
        unfocusedLinesOpacity={unfocusedLinesOpacity}
        baseDirectory={baseDirectory}
        components={components}
        {...restProps}
      />
    </Suspense>
  )
}

async function CodeBlockAsync({
  path,
  baseDirectory: baseDirectory,
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
  components = {},
}: CodeBlockProps) {
  const PADDING_X = 'var(--padding-x, 0.5lh)'
  const PADDING_Y = 'var(--padding-y, 0.5lh)'
  const containerPadding = {
    top: PADDING_Y,
    right: PADDING_X,
    bottom: PADDING_Y,
    left: PADDING_X,
    horizontal: PADDING_X,
    vertical: PADDING_Y,
    all: `${PADDING_Y} ${PADDING_X}`,
  }
  const {
    Container: ContainerComponent = DefaultContainer,
    Pre: PreComponent = DefaultPre,
    Code: CodeComponent = DefaultCode,
    LineNumbers: LineNumbersComponent = LineNumbers,
    Tokens: TokensComponent = Tokens,
    Toolbar: ToolbarComponent = Toolbar,
    CopyButton: CopyButtonComponent = CopyButton,
  } = components
  const resolvers = {} as {
    promise: Promise<void>
    resolve: () => void
    reject: (error: unknown) => void
  }
  resolvers.promise = new Promise<void>((resolve, reject) => {
    resolvers.resolve = resolve
    resolvers.reject = reject
  })
  const contextValue = {
    filePath: path,
    padding: containerPadding.all,
    allowErrors,
    showErrors,
    shouldAnalyze,
    shouldFormat,
    highlightedLines,
    language,
    baseDirectory,
    resolvers,
  } satisfies ContextValue
  let value: string

  if (typeof children === 'string') {
    value = children
  } else if (
    typeof children === 'object' &&
    children !== null &&
    'then' in children
  ) {
    value = (await children) as string
  } else {
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
  const containerClassData = shouldRenderToolbar
    ? css({
        borderRadius: 5,
        boxShadow: `0 0 0 1px ${theme.panel.border}`,
        backgroundColor: theme.background,
        color: theme.foreground,
        padding: 0,
      })
    : null
  const containerClassName = containerClassData?.[0]
  const ContainerStyles = containerClassData?.[1]
  const focusedLinesStyles = focusedLines
    ? {
        '--m0': `rgba(0, 0, 0, ${unfocusedLinesOpacity})`,
        '--m1': 'rgba(0, 0, 0, 1)',
        maskPosition: `0 ${containerPadding.top}`,
        maskImage: focusedLinesGradient,
      }
    : {}
  const [preClassName, PreStyles] = css({
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
    ...getThemeTokenVariables(config.theme),
    padding: 0,
  })
  const [codeWithNumbersClassName, CodeWithNumbersStyles] = css({
    gridColumn: 2,
    padding: `${containerPadding.vertical} ${containerPadding.horizontal} 0 0`,
    ...focusedLinesStyles,
  })
  const [codeWithoutNumbersClassName, CodeWithoutNumbersStyles] = css({
    gridColumn: 1,
    padding: `${containerPadding.vertical} ${containerPadding.horizontal} 0`,
    ...focusedLinesStyles,
  })

  return (
    <Context value={contextValue}>
      <ContainerComponent
        shouldRenderToolbar={shouldRenderToolbar}
        padding={containerPadding}
        theme={theme}
        className={shouldRenderToolbar ? containerClassName : undefined}
      >
        {shouldRenderToolbar ? (
          <ToolbarComponent
            allowCopy={allowCopy === undefined ? Boolean(path) : allowCopy}
            css={{ padding: containerPadding.all }}
          />
        ) : null}
        <PreComponent
          shouldRenderToolbar={shouldRenderToolbar}
          showLineNumbers={Boolean(showLineNumbers)}
          padding={containerPadding}
          theme={theme}
          highlightedLines={highlightedLines}
          focusedLines={focusedLines}
          className={preClassName}
        >
          {showLineNumbers ? (
            <>
              <LineNumbersComponent
                css={{
                  padding: containerPadding.all,
                  gridColumn: 1,
                  gridRow: '1 / -1',
                  width: '4ch',
                  backgroundPosition: 'inherit',
                  backgroundImage: 'inherit',
                }}
              />
              <CodeComponent
                showLineNumbers
                padding={containerPadding}
                className={codeWithNumbersClassName}
              >
                <TokensComponent>{value}</TokensComponent>
              </CodeComponent>
            </>
          ) : (
            <CodeComponent
              showLineNumbers={false}
              padding={containerPadding}
              className={codeWithoutNumbersClassName}
            >
              <TokensComponent>{value}</TokensComponent>
            </CodeComponent>
          )}
          {allowCopy !== false && !shouldRenderToolbar ? (
            <CopyButtonComponent
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
              }}
            />
          ) : null}
        </PreComponent>
      </ContainerComponent>
      {shouldRenderToolbar && ContainerStyles ? <ContainerStyles /> : null}
      <PreStyles />
      {showLineNumbers ? (
        <CodeWithNumbersStyles />
      ) : (
        <CodeWithoutNumbersStyles />
      )}
    </Context>
  )
}

function DefaultContainer({
  shouldRenderToolbar,
  className,
  children,
}: CodeBlockContainerProps) {
  if (!shouldRenderToolbar) {
    return <>{children}</>
  }

  return <StyledContainer className={className}>{children}</StyledContainer>
}

function DefaultPre({ className, children }: CodeBlockPreProps) {
  return <Pre className={className}>{children}</Pre>
}

function DefaultCode({ className, children }: CodeBlockCodeProps) {
  return <Code className={className}>{children}</Code>
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
