import React, { Suspense } from 'react'
import { css, styled } from 'restyle'

import type { Languages } from '../../grammars/index.js'
import { grammars } from '../../grammars/index.js'
import {
  getThemeColors,
  getThemeTokenVariables,
} from '../../utils/get-theme.js'
import { getConfig } from '../Config/ServerConfigContext.js'
import { CopyButton } from '../CopyButton/index.js'
import {
  CodeBlock as CodeBlockBase,
  type CodeBlockProps,
  type CodeBlockContainerProps,
  type CodeBlockPreProps,
  type CodeBlockCodeProps,
} from './CodeBlock.js'
import type { ContextValue } from './Context.js'
import { Context } from './Context.js'
import type { LineNumbersProps } from './LineNumbers.js'
import { LineNumbers } from './LineNumbers.js'
import type { TokensProps } from './Tokens.js'
import { Tokens } from './Tokens.js'
import type { ToolbarProps } from './Toolbar.js'
import { Toolbar } from './Toolbar.js'
import { getScrollContainerStyles } from './utils.js'

type CopyButtonProps = React.ComponentProps<typeof CopyButton>

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

  const { variant, ...blockProps } = normalizeBlockProps(props)
  return <CodeBlockBase {...blockProps} />
}

type CodeNamespace = typeof CodeComponent & {
  Provider: typeof CodeProvider
  Tokens: typeof Tokens
  LineNumbers: typeof LineNumbers
  Toolbar: typeof Toolbar
  CopyButton: typeof CopyButton
}

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
