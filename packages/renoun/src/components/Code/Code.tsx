import React, { Suspense } from 'react'
import { css, styled } from 'restyle'

import { grammars } from '../../grammars/index.js'
import { getContext } from '../../utils/context.js'
import {
  getThemeColors,
  getThemeTokenVariables,
} from '../../utils/get-theme.js'
import type { Languages } from '../../utils/get-language.js'
import { BaseDirectoryContext } from '../Context.js'
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

type CopyButtonProps = React.ComponentProps<typeof CopyButton>

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
  return <CodeElement className={className}>{children}</CodeElement>
}

const StyledContainer = styled('div')

const CodeElement = styled('code', {
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

interface CodeInlineRootProps {
  /** Whether the inline code snippet should display a persistent copy button. */
  allowCopy?: boolean | string

  /** Base class name generated for the inline snippet. */
  className: string

  /** Highlighted code content. */
  children: React.ReactNode
}

interface CodeInlineComponents {
  /** Custom renderer for the inline root element. */
  Root?: React.ComponentType<CodeInlineRootProps>

  /** Custom renderer for highlighted tokens. */
  Tokens?: React.ComponentType<TokensProps>

  /** Custom renderer for the persistent copy button. */
  CopyButton?: React.ComponentType<CopyButtonProps>
}

type CodeInlineProps = {
  /** Code snippet to be highlighted. */
  children: string

  /** Language of the code snippet. */
  language?: Languages

  /** Show or hide a persistent button that copies the `children` string or provided text to the clipboard. */
  allowCopy?: boolean | string

  /** Whether or not to allow errors when a `language` is specified. Accepts a boolean or comma-separated list of allowed error codes. */
  allowErrors?: boolean | string

  /** Show or hide error diagnostics when a `language` is specified. */
  showErrors?: boolean

  /** Whether or not to analyze the source code for type errors and provide quick information on hover. */
  shouldAnalyze?: boolean

  /** Override internal sub-components with custom implementations. */
  components?: CodeInlineComponents
}

const CodeInlineComponent =
  process.env.NODE_ENV === 'development'
    ? CodeInlineWithFallback
    : CodeInlineAsync

function CodeInlineWithFallback({
  shouldAnalyze = false,
  components,
  ...props
}: CodeInlineProps) {
  return (
    <Suspense
      fallback={
        <DefaultInlineFallback allowCopy={props.allowCopy}>
          {props.children}
        </DefaultInlineFallback>
      }
    >
      <CodeInlineAsync
        shouldAnalyze={shouldAnalyze}
        components={components}
        {...props}
      />
    </Suspense>
  )
}

const INLINE_PADDING_X = '0.25em'
const INLINE_PADDING_Y = '0.1em'

async function CodeInlineAsync({
  children,
  language,
  allowCopy,
  allowErrors,
  showErrors,
  shouldAnalyze,
  components,
}: CodeInlineProps) {
  const config = await getConfig()
  const theme = await getThemeColors(config.theme)
  const {
    Root: RootComponent = DefaultInlineRoot,
    Tokens: TokensComponent = Tokens,
    CopyButton: CopyButtonComponent = CopyButton,
  } = components ?? {}
  const [classNames, Styles] = css({
    display: allowCopy ? 'inline-grid' : 'inline',
    alignItems: allowCopy ? 'center' : undefined,
    verticalAlign: 'text-bottom',
    padding: `${INLINE_PADDING_Y} ${INLINE_PADDING_X} 0`,
    gap: allowCopy ? '1ch' : undefined,
    color: theme.foreground,
    backgroundColor: theme.background,
    boxShadow: `0 0 0 1px ${theme.panel.border}`,
    borderRadius: 5,
    position: 'relative',
    overflowY: 'hidden',
    ...getScrollContainerStyles({
      paddingBottom: INLINE_PADDING_Y,
      color: theme.scrollbarSlider.hoverBackground,
    }),
    ...getThemeTokenVariables(config.theme),
  })
  const childrenToRender = language ? (
    <TokensComponent
      language={language}
      allowErrors={allowErrors}
      showErrors={showErrors}
      shouldAnalyze={shouldAnalyze}
    >
      {children}
    </TokensComponent>
  ) : (
    children
  )

  const content = allowCopy ? (
    <InlineContent>{childrenToRender}</InlineContent>
  ) : (
    childrenToRender
  )

  const copyButton = allowCopy ? (
    <CopyButtonComponent
      value={typeof allowCopy === 'string' ? allowCopy : children}
      css={{
        position: 'sticky',
        right: 0,
        gridArea: '1 / 2',
        marginLeft: 'auto',
        color: theme.activityBar.foreground,
      }}
    />
  ) : null

  return (
    <>
      <Styles />
      <RootComponent allowCopy={allowCopy} className={classNames}>
        {content}
        {copyButton}
      </RootComponent>
    </>
  )
}

const InlineContent = styled('span', {
  gridArea: '1 / 1',
  width: 'max-content',
})

const CodeFallback = styled('code', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '1ch',
  whiteSpace: 'nowrap',
  overflowX: 'scroll',
  overflowY: 'hidden',
})

function DefaultInlineRoot({ className, children }: CodeInlineRootProps) {
  return <code className={className}>{children}</code>
}

function DefaultInlineFallback({
  allowCopy,
  children,
}: {
  allowCopy?: boolean | string
  children: string
}) {
  return (
    <CodeFallback
      css={{
        display: allowCopy ? 'inline-flex' : 'inline-block',
        alignItems: allowCopy ? 'center' : undefined,
        verticalAlign: 'text-bottom',
        padding: `${INLINE_PADDING_Y} ${INLINE_PADDING_X} 0`,
        paddingRight: allowCopy
          ? `calc(1ch + 1lh + ${INLINE_PADDING_X})`
          : undefined,
        gap: allowCopy ? '1ch' : undefined,
        borderRadius: 5,
        whiteSpace: 'nowrap',
        position: 'relative',
        ...getScrollContainerStyles({ paddingBottom: INLINE_PADDING_Y }),
      }}
    >
      {allowCopy ? <InlineContent>{children}</InlineContent> : children}
    </CodeFallback>
  )
}

type CodeInlineElementProps = {
  variant: 'inline'
} & React.ComponentProps<'code'>

type CodeBlockElementProps = {
  variant?: 'block'
} & React.ComponentProps<'pre'>

const LANGUAGE_CLASS_PREFIX = 'language-'
const LANGUAGE_CLASS_PREFIX_LENGTH = LANGUAGE_CLASS_PREFIX.length

function normalizeInlineProps(
  props: CodeInlineVariantProps | CodeInlineElementProps
): CodeInlineVariantProps {
  const { variant, children, className, style, ...restProps } =
    props as CodeInlineElementProps &
      CodeInlineVariantProps & {
        className?: string
        style?: React.CSSProperties
      }
  void style

  const stringChildren = toText(children)
  const languageFromProps = restProps.language
  const languageFromClassName = extractLanguageFromClassName(className)
  const parsed = parseInlineLanguage(stringChildren)

  return {
    variant,
    ...(restProps as Omit<CodeInlineVariantProps, 'variant' | 'children'>),
    language: languageFromProps ?? languageFromClassName ?? parsed.language,
    children:
      languageFromProps || languageFromClassName
        ? stringChildren
        : parsed.value,
  }
}

function normalizeBlockProps(
  props: CodeBlockVariantProps | CodeBlockElementProps
): CodeBlockVariantProps {
  const codeElement = findCodeElement((props as CodeBlockElementProps).children)

  if (!codeElement) {
    return props as CodeBlockVariantProps
  }

  const { variant, children, className, style, ...restProps } =
    props as CodeBlockElementProps &
      CodeBlockVariantProps & {
        className?: string
        style?: React.CSSProperties
      }
  void className
  void style
  const { value, language, path } = parseBlockElement(codeElement)
  const blockProps = restProps as CodeBlockVariantProps

  return {
    ...blockProps,
    variant,
    children: blockProps.children ?? value,
    language: blockProps.language ?? language,
    path: blockProps.path ?? path,
  }
}

function findCodeElement(children: React.ReactNode): React.ReactElement<{
  className?: string
  children?: React.ReactNode
}> | null {
  const nodes = React.Children.toArray(children)
  for (const node of nodes) {
    if (React.isValidElement(node) && node.type === 'code') {
      return node as React.ReactElement<{
        className?: string
        children?: React.ReactNode
      }>
    }
  }
  return null
}

function toText(children: React.ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children)
  }

  return React.Children.toArray(children)
    .map((child) => {
      if (typeof child === 'string' || typeof child === 'number') {
        return String(child)
      }
      return ''
    })
    .join('')
}

function extractLanguageFromClassName(
  className?: string
): Languages | undefined {
  if (!className) {
    return undefined
  }

  const languageToken = className
    .split(/\s+/)
    .find((value) => value.startsWith(LANGUAGE_CLASS_PREFIX))

  if (!languageToken) {
    return undefined
  }

  const raw = languageToken.slice(LANGUAGE_CLASS_PREFIX_LENGTH)
  const language = raw.slice(raw.lastIndexOf('.') + 1) as Languages
  return language
}

function parseInlineLanguage(value: string): {
  language?: Languages
  value: string
} {
  const firstSpaceIndex = value.indexOf(' ')

  if (firstSpaceIndex === -1) {
    return { value }
  }

  const possibleLanguage = value.substring(0, firstSpaceIndex) as Languages
  const isValidLanguage = Object.values(grammars).some((aliases) =>
    (aliases as readonly Languages[]).includes(possibleLanguage)
  )

  if (!isValidLanguage) {
    return { value }
  }

  return {
    language: possibleLanguage,
    value: value.slice(firstSpaceIndex + 1),
  }
}

function parseBlockElement(
  element: React.ReactElement<{
    className?: string
    children?: React.ReactNode
  }>
): { value: string; language?: Languages; path?: string } {
  const meta = extractLanguageMeta(element.props.className)
  const children = toText(element.props.children).trim()

  return {
    value: children,
    language: meta.language,
    path: meta.path,
  }
}

function extractLanguageMeta(className?: string): {
  language?: Languages
  path?: string
} {
  if (!className) {
    return {}
  }

  const languageToken = className
    .split(/\s+/)
    .find((value) => value.startsWith(LANGUAGE_CLASS_PREFIX))

  if (!languageToken) {
    return {}
  }

  const raw = languageToken.slice(LANGUAGE_CLASS_PREFIX_LENGTH)
  const dotIndex = raw.lastIndexOf('.')

  if (dotIndex !== -1) {
    return {
      path: raw,
      language: raw.slice(dotIndex + 1) as Languages,
    }
  }

  return { language: raw as Languages }
}

export type CodeBlockVariantProps = {
  variant?: 'block'
} & CodeBlockProps

export type CodeInlineVariantProps = {
  variant: 'inline'
} & CodeInlineProps

export type CodeProps =
  | CodeBlockVariantProps
  | CodeInlineVariantProps
  | CodeBlockElementProps
  | CodeInlineElementProps

type CodeContextValue = Exclude<ContextValue, null>

function createResolvers(
  existing?: CodeContextValue['resolvers']
): CodeContextValue['resolvers'] {
  if (existing) {
    return existing
  }

  const resolvers: CodeContextValue['resolvers'] = {} as any
  resolvers.promise = new Promise<void>((resolve, reject) => {
    resolvers.resolve = resolve
    resolvers.reject = reject
  })

  return resolvers
}

type CodeProviderProps = {
  children: React.ReactNode
  value?: Partial<CodeContextValue>
}

function CodeProvider({ children, value = {} }: CodeProviderProps) {
  const providerValue = {
    ...value,
    resolvers: createResolvers(value.resolvers),
  } as CodeContextValue

  return <Context value={providerValue}>{children}</Context>
}

function CodeComponent(props: CodeProps) {
  if (props.variant === 'inline') {
    const { variant, ...inlineProps } = normalizeInlineProps(props)
    return <CodeInlineComponent {...inlineProps} />
  }

  const {
    variant,
    shouldFormat = true,
    ...blockProps
  } = normalizeBlockProps(props)
  return <CodeBlock {...blockProps} />
}

type CodeNamespace = typeof CodeComponent & {
  Provider: typeof CodeProvider
  Tokens: typeof Tokens
  LineNumbers: typeof LineNumbers
  Toolbar: typeof Toolbar
  CopyButton: typeof CopyButton
}

/**
 * Displays syntax-highlighted source code with optional line numbers, toolbar,
 * copy-to-clipboard button, and error diagnostics.
 */
export const Code = Object.assign(CodeComponent, {
  Provider: CodeProvider,
  Tokens,
  LineNumbers,
  Toolbar,
  CopyButton,
}) as CodeNamespace

export type CodeComponents = {
  Block: CodeBlockProps
  BlockContainer: CodeBlockContainerProps
  BlockPre: CodeBlockPreProps
  BlockCode: CodeBlockCodeProps
  Inline: CodeInlineProps
  InlineRoot: CodeInlineRootProps
  Provider: CodeProviderProps
  Tokens: TokensProps
  LineNumbers: LineNumbersProps
  Toolbar: ToolbarProps
  CopyButton: CopyButtonProps
}
