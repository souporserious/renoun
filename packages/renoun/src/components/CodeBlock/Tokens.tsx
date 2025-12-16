import React, { Fragment, Suspense } from 'react'
import type { CSSObject } from 'restyle'
import { css } from 'restyle/css'

import { getSourceTextMetadata, getTokens } from '../../project/client.ts'
import type { Languages } from '../../utils/get-language.ts'
import type { SourceTextMetadata } from '../../utils/get-source-text-metadata.ts'
import type {
  Token,
  TokenDiagnostic,
  TokenizedLines,
} from '../../utils/get-tokens.ts'
import { getContext } from '../../utils/context.tsx'
import {
  BASE_TOKEN_CLASS_NAME,
  getThemeColors,
  hasMultipleThemes,
} from '../../utils/get-theme.ts'
import {
  hasAnnotationCandidates,
  parseAnnotations,
  remapAnnotationInstructions,
  type AnnotationParseResult,
  type AnnotationInstructions,
  type BlockAnnotationInstruction,
  type InlineAnnotationInstruction,
} from '../../utils/annotations.ts'
import { getConfig } from '../Config/ServerConfigContext.tsx'
import type { ConfigurationOptions } from '../Config/types.ts'
import { readCodeFromPath } from '../../utils/read-code-from-path.ts'
import { pathLikeToString, type PathLike } from '../../utils/path.ts'
import { QuickInfo, QuickInfoLoading } from './QuickInfo.tsx'
import { QuickInfoProvider } from './QuickInfoProvider.tsx'
import { Context } from './Context.tsx'
import { Symbol } from './Symbol.tsx'

type ThemeColors = Awaited<ReturnType<typeof getThemeColors>>

export type AnnotationRenderer = React.ComponentType<
  Record<string, any> & { children?: React.ReactNode }
>

export type AnnotationRenderers = Record<string, AnnotationRenderer>

export interface TokensProps {
  /** Code string to highlight and render as tokens. */
  children?: string | Promise<string>

  /** Name or path of the tokens to render. This will read the local file system contents from the `baseDirectory` joined with the `path` prop instead of creating a virtual file. Pass `null` to explicitly disable context inheritance. */
  path?: PathLike | null

  /** The base directory to use when analyzing the source code. This will read the local file system contents from the `baseDirectory` joined with the `path` prop instead of creating a virtual file. */
  baseDirectory?: PathLike

  /** Language to use for syntax highlighting. */
  language?: Languages

  /** Whether to allow errors to be displayed. */
  allowErrors?: boolean | string

  /** Whether to show errors. */
  showErrors?: boolean

  /** Whether or not to analyze the source code for type errors and provide quick information on hover. */
  shouldAnalyze?: boolean

  /** Whether or not to format the source code using `prettier` if installed. */
  shouldFormat?: boolean

  /** CSS style object to apply to the tokens and popover elements. */
  css?: {
    token?: CSSObject
    popover?: CSSObject
    error?: CSSObject
  }

  /** Class names to apply to the tokens and popover elements. */
  className?: {
    token?: string
    popover?: string
    error?: string
  }

  /** Styles to apply to the tokens and popover elements. */
  style?: {
    token?: React.CSSProperties
    popover?: React.CSSProperties
    error?: React.CSSProperties
  }

  /** Optional theme configuration to drive highlighting explicitly. */
  theme?: ConfigurationOptions['theme']

  /** Custom render function for each line of tokens. */
  renderLine?: (line: {
    children: React.ReactNode
    index: number
    isLast: boolean
  }) => React.ReactNode

  /**
   * Map of annotation tag names to render functions. When provided, comments
   * matching the annotation signature will be removed from the rendered output
   * and replaced with the corresponding annotation components.
   */
  annotations?: AnnotationRenderers
}

/** Renders syntax highlighted tokens for the `CodeBlock` component. */
export async function Tokens({
  children,
  language: languageProp,
  allowErrors: allowErrorsProp,
  showErrors: showErrorsProp,
  shouldAnalyze: shouldAnalyzeProp,
  shouldFormat: shouldFormatProp,
  path,
  baseDirectory,
  renderLine,
  css = {},
  className = {},
  style = {},
  theme: themeProp,
  annotations,
}: TokensProps) {
  const context = getContext(Context)
  const config = await getConfig()
  const theme = await getThemeColors(config.theme)
  const language = languageProp || context?.language
  const themeConfiguration = themeProp ?? config.theme
  const baseTokenClassName = hasMultipleThemes(themeConfiguration)
    ? BASE_TOKEN_CLASS_NAME
    : undefined
  let value

  if (children) {
    if (typeof children === 'string') {
      value = children
    } else {
      value = await children
    }
  }

  if (value === undefined) {
    if (path) {
      value = await readCodeFromPath(path, baseDirectory)
    } else {
      throw new Error(
        '[renoun] No code value provided to Tokens component. Pass a string, a promise that resolves to a string, or wrap within a `CodeBlock` component that defines `path` and `baseDirectory` props.'
      )
    }
  }

  let annotationParseResult: AnnotationParseResult | null = null
  let annotationInstructions: AnnotationInstructions | null = null
  let processedValue = value

  if (annotations) {
    const annotationTags = Object.keys(annotations)
    if (
      annotationTags.length > 0 &&
      hasAnnotationCandidates(value, annotationTags)
    ) {
      annotationParseResult = parseAnnotations(value, annotationTags)
      processedValue = annotationParseResult.value
      annotationInstructions = {
        block: annotationParseResult.block,
        inline: annotationParseResult.inline,
      }
    }
  }

  const shouldAnalyze = shouldAnalyzeProp ?? context?.shouldAnalyze ?? true
  const shouldFormat = shouldFormatProp ?? context?.shouldFormat ?? true
  const isFormattingExplicit =
    shouldFormatProp !== undefined || context?.shouldFormat !== undefined
  const metadata: SourceTextMetadata = {} as SourceTextMetadata

  if (shouldAnalyze) {
    const result = await getSourceTextMetadata({
      filePath: path ? pathLikeToString(path) : undefined,
      baseDirectory: baseDirectory
        ? pathLikeToString(baseDirectory)
        : undefined,
      value: processedValue,
      language,
      shouldFormat,
      isFormattingExplicit,
    })
    metadata.value = result.value
    metadata.language = result.language
    metadata.filePath = result.filePath
    metadata.label = result.label
  } else {
    metadata.value = processedValue
    metadata.language = language
    metadata.label = context?.label
  }

  if (annotationInstructions && annotationParseResult) {
    annotationInstructions = remapAnnotationInstructions(
      annotationInstructions,
      annotationParseResult.value,
      metadata.value
    )
  }

  // Now we can resolve the context values for other components like `LineNumbers`, `CopyButton`, etc.
  if (context) {
    context.resolved = {
      value: metadata.value,
      language: metadata.language!,
      filePath: metadata.filePath!,
      label: metadata.label!,
    }
    context.resolvers.resolve()
  }

  const showErrors =
    showErrorsProp === undefined ? context?.showErrors : showErrorsProp
  const allowErrors =
    allowErrorsProp === undefined
      ? context?.allowErrors === undefined
        ? showErrors
          ? true
          : undefined
        : context.allowErrors
      : allowErrorsProp

  const tokens = await getTokens({
    value: metadata.value,
    language: metadata.language,
    filePath: metadata.filePath,
    allowErrors,
    showErrors,
    theme: themeConfiguration,
    languages: config.languages,
  })
  const lastLineIndex = tokens.length - 1
  const hasAnnotations =
    annotationInstructions !== null &&
    (annotationInstructions.block.length > 0 ||
      annotationInstructions.inline.length > 0)

  if (!hasAnnotations) {
    return (
      <QuickInfoProvider>
        {tokens.map((line, lineIndex) => {
          const lineChildren = line.map((token, tokenIndex) =>
            renderToken({
              token,
              tokenIndex,
              lineIndex,
              baseTokenClassName,
              theme,
              css,
              className,
              style,
            })
          )
          const diagnostics = getUniqueDiagnostics(line)
          const diagnosticNodes = renderDiagnostics({
            diagnostics,
            lineIndex,
            baseTokenClassName,
            theme,
            className,
            style,
          })
          const lineChildrenWithDiagnostics = diagnosticNodes.length
            ? lineChildren.concat(diagnosticNodes)
            : lineChildren
          const isLastLine = lineIndex === lastLineIndex
          // If diagnostics are rendered with display: block, avoid adding the
          // trailing newline after the line; the block element will naturally
          // place subsequent content on the next line, and adding a newline
          // would introduce extra vertical space below the diagnostic.
          const hasDiagnostics = diagnosticNodes.length > 0
          const explicitDiagnosticDisplay =
            css?.error?.display ?? style?.error?.display
          const diagnosticsAreBlock = explicitDiagnosticDisplay
            ? explicitDiagnosticDisplay !== 'inline' &&
              explicitDiagnosticDisplay !== 'inline-block'
            : true
          const shouldAppendLineBreak =
            !isLastLine && !(hasDiagnostics && diagnosticsAreBlock)
          const renderedLine = renderLine
            ? renderLine({
                children: lineChildrenWithDiagnostics,
                index: lineIndex,
                isLast: isLastLine,
              })
            : lineChildrenWithDiagnostics

          if (renderLine && renderedLine) {
            return renderedLine
          }

          return (
            <Fragment key={lineIndex}>
              {lineChildrenWithDiagnostics}
              {shouldAppendLineBreak ? '\n' : null}
            </Fragment>
          )
        })}
      </QuickInfoProvider>
    )
  }

  const annotatedNodes = renderWithAnnotations({
    annotations: annotations!,
    block: annotationInstructions!.block,
    inline: annotationInstructions!.inline,
    tokens,
    value: metadata.value,
    baseTokenClassName,
    theme,
    css,
    className,
    style,
  })

  return <QuickInfoProvider>{annotatedNodes}</QuickInfoProvider>
}

interface RenderTokenOptions {
  token: Token
  tokenIndex: number
  lineIndex: number
  baseTokenClassName?: string
  theme: ThemeColors
  css?: TokensProps['css']
  className?: TokensProps['className']
  style?: TokensProps['style']
}

interface RenderDiagnosticsOptions {
  diagnostics: TokenDiagnostic[]
  lineIndex: number
  baseTokenClassName?: string
  theme: ThemeColors
  css?: TokensProps['css']
  className?: TokensProps['className']
  style?: TokensProps['style']
}

interface RenderWithAnnotationsOptions {
  annotations: AnnotationRenderers
  block: BlockAnnotationInstruction[]
  inline: InlineAnnotationInstruction[]
  tokens: TokenizedLines
  value: string
  baseTokenClassName?: string
  theme: ThemeColors
  css?: TokensProps['css']
  className?: TokensProps['className']
  style?: TokensProps['style']
}

function renderToken({
  token,
  tokenIndex,
  lineIndex,
  baseTokenClassName,
  theme,
  css: cssProp,
  className,
  style,
}: RenderTokenOptions): React.ReactNode {
  const hasDiagnostics = Boolean(token.diagnostics?.length)
  const hasQuickInfo = Boolean(token.quickInfo)

  if (
    token.isWhiteSpace ||
    (!hasQuickInfo &&
      !hasDiagnostics &&
      !token.hasTextStyles &&
      token.isBaseColor)
  ) {
    return token.value
  }

  const deprecatedStyles = {
    textDecoration: 'line-through',
  }
  const diagnosticStyles = hasDiagnostics
    ? {
        backgroundImage: `url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%2C0%206%203'%20enable-background%3D'new%200%200%206%203'%20height%3D'3'%20width%3D'6'%3E%3Cg%20fill%3D'%23f14c4c'%3E%3Cpolygon%20points%3D'5.5%2C0%202.5%2C3%201.1%2C3%204.1%2C0'%2F%3E%3Cpolygon%20points%3D'4%2C0%206%2C2%206%2C0.6%205.4%2C0'%2F%3E%3Cpolygon%20points%3D'0%2C2%201%2C3%202.4%2C3%200%2C0.6'%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E")`,
        backgroundRepeat: 'repeat-x',
        backgroundPosition: 'bottom left',
      }
    : undefined
  const [tokenClassNamePart, Styles] = css({
    ...token.style,
    ...(token.isDeprecated && deprecatedStyles),
    ...diagnosticStyles,
    ...cssProp?.token,
  })
  const tokenClassName = joinClassNames(
    tokenClassNamePart,
    baseTokenClassName,
    className?.token
  )

  if (hasQuickInfo) {
    return (
      <Symbol
        key={`${lineIndex}-${tokenIndex}`}
        highlightColor={theme.editor.hoverHighlightBackground}
        popover={
          <Suspense
            fallback={
              <QuickInfoLoading
                css={cssProp?.popover}
                className={className?.popover}
                style={style?.popover}
              />
            }
          >
            <QuickInfo
              quickInfo={token.quickInfo}
              css={cssProp?.popover}
              className={className?.popover}
              style={style?.popover}
            />
          </Suspense>
        }
        className={tokenClassName}
        style={style?.token}
      >
        {token.value}
        <Styles />
      </Symbol>
    )
  }

  return (
    <span
      key={`${lineIndex}-${tokenIndex}`}
      className={tokenClassName}
      style={style?.token}
    >
      {token.value}
      <Styles />
    </span>
  )
}

function getUniqueDiagnostics(line: Token[]): TokenDiagnostic[] {
  if (!line.length) {
    return []
  }

  const seen = new Set<string>()
  const uniqueDiagnostics: TokenDiagnostic[] = []

  for (const token of line) {
    if (!token.diagnostics) {
      continue
    }

    for (const diagnostic of token.diagnostics) {
      const key = `${diagnostic.code ?? 'unknown'}:${diagnostic.message}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)
      uniqueDiagnostics.push(diagnostic)
    }
  }

  return uniqueDiagnostics
}

function renderDiagnostics({
  diagnostics,
  lineIndex,
  baseTokenClassName,
  theme,
  css: cssProp,
  className,
  style,
}: RenderDiagnosticsOptions): React.ReactNode[] {
  if (!diagnostics.length) {
    return []
  }

  const nodes: React.ReactNode[] = []

  diagnostics.forEach((diagnostic, index) => {
    const [diagnosticClassName, Styles] = css({
      display: 'block',
      color: theme.editorError.foreground,
      backgroundColor: 'color-mix(in oklab, currentColor 18%, transparent)',
      paddingLeft: '0.75ch',
      whiteSpace: 'pre-wrap',
      ...cssProp?.error,
    })
    const diagnosticText =
      diagnostic.code !== undefined
        ? `${diagnostic.message} (${diagnostic.code})`
        : diagnostic.message

    nodes.push('\n')
    nodes.push(
      <span
        key={`diagnostic-${lineIndex}-${index}`}
        className={joinClassNames(
          baseTokenClassName,
          diagnosticClassName,
          className?.token,
          className?.error
        )}
        style={{ ...style?.token, ...style?.error }}
      >
        {diagnosticText}
        <Styles />
      </span>
    )
  })

  return nodes
}

function renderWithAnnotations({
  annotations,
  block,
  inline,
  tokens,
  value,
  baseTokenClassName,
  theme,
  css,
  className,
  style,
}: RenderWithAnnotationsOptions): React.ReactNode {
  const blockStartMap = new Map<number, BlockAnnotationInstruction[]>()
  const blockEndMap = new Map<number, BlockAnnotationInstruction[]>()

  for (const instruction of block) {
    const startList = blockStartMap.get(instruction.start)
    if (startList) startList.push(instruction)
    else blockStartMap.set(instruction.start, [instruction])

    const endList = blockEndMap.get(instruction.end)
    if (endList) endList.push(instruction)
    else blockEndMap.set(instruction.end, [instruction])
  }

  const inlineMap = new Map<number, InlineAnnotationInstruction[]>()
  for (const instruction of inline) {
    const list = inlineMap.get(instruction.index)
    if (list) list.push(instruction)
    else inlineMap.set(instruction.index, [instruction])
  }

  let annotationKey = 0
  const rootChildren: React.ReactNode[] = []
  const childrenStack: React.ReactNode[][] = [rootChildren]
  const frameStack: BlockAnnotationInstruction[] = []
  let lastProcessedBoundary: number | null = null

  const currentChildren = () =>
    childrenStack.length > 0
      ? childrenStack[childrenStack.length - 1]
      : rootChildren

  const appendNode = (node: React.ReactNode) => {
    if (node === null || node === undefined) {
      return
    }
    currentChildren().push(node)
  }

  const appendText = (text: string) => {
    if (text.length === 0) {
      return
    }
    appendNode(text)
  }

  const createAnnotationElement = (
    tag: string,
    props: Record<string, any>,
    children: React.ReactNode[]
  ) => {
    const Renderer = annotations[tag]
    if (!Renderer) {
      if (children.length === 1) {
        return children[0]
      }
      return React.createElement(
        React.Fragment,
        { key: `annotation-${annotationKey++}` },
        ...children
      )
    }

    return React.createElement(
      Renderer,
      { ...props, key: `annotation-${annotationKey++}` },
      ...children
    )
  }

  const openAt = (position: number) => {
    const instructions = blockStartMap.get(position)
    if (!instructions) return

    for (const instruction of instructions) {
      frameStack.push(instruction)
      childrenStack.push([])
    }
  }

  const closeAt = (position: number) => {
    const instructions = blockEndMap.get(position)
    if (!instructions) return

    for (let index = instructions.length - 1; index >= 0; index--) {
      const instruction = instructions[index]
      if (childrenStack.length <= 1) {
        // Nothing to close; ignore stray closing instruction
        continue
      }

      const children = childrenStack.pop() ?? []
      const frame = frameStack.pop()
      if (!frame || frame !== instruction) {
        for (const child of children) {
          appendNode(child)
        }
        continue
      }

      const element = createAnnotationElement(
        instruction.tag,
        instruction.props,
        children
      )
      appendNode(element)
    }
  }

  const processBoundary = (position: number) => {
    if (position === lastProcessedBoundary) return
    if (!blockStartMap.has(position) && !blockEndMap.has(position)) return

    closeAt(position)
    openAt(position)
    lastProcessedBoundary = position
  }

  let currentPosition = 0
  processBoundary(currentPosition)

  // Precompute sorted event positions to allow splitting arbitrary text ranges
  const startPositions = Array.from(blockStartMap.keys()).sort((a, b) => a - b)
  const endPositions = Array.from(blockEndMap.keys()).sort((a, b) => a - b)
  const boundarySet = new Set<number>([...startPositions, ...endPositions])
  const advanceTo = (target: number) => {
    while (true) {
      let nextEvent: number | null = null
      // Check for the nearest boundary > currentPosition and <= target
      for (const position of boundarySet) {
        if (position <= currentPosition) continue
        if (position > target) continue
        if (nextEvent === null || position < nextEvent) nextEvent = position
      }

      if (nextEvent === null) break

      appendText(value.slice(currentPosition, nextEvent))
      currentPosition = nextEvent
      // Close before opening at the same index to respect boundaries
      closeAt(currentPosition)
      openAt(currentPosition)
    }
  }

  tokens.forEach((line, lineIndex) => {
    line.forEach((token, tokenIndex) => {
      if (token.start > currentPosition) {
        advanceTo(token.start)
        appendText(value.slice(currentPosition, token.start))
        currentPosition = token.start
      } else {
        // No gap; still process events that occur exactly at this boundary
        processBoundary(token.start)
      }

      // Emit this token in slices so that block boundaries within the token
      // become their own nodes.
      while (currentPosition < token.end) {
        // Find next boundary inside this token range
        let sliceEnd: number = token.end
        for (const position of boundarySet) {
          if (position <= currentPosition) continue
          if (position > token.end) continue
          if (position < sliceEnd) sliceEnd = position
        }

        let node = renderToken({
          token: {
            ...token,
            start: currentPosition,
            end: sliceEnd,
            value: value.slice(currentPosition, sliceEnd),
          },
          tokenIndex,
          lineIndex,
          baseTokenClassName,
          theme,
          css,
          className,
          style,
        })

        const inlineInstructions = inlineMap.get(currentPosition)
        if (inlineInstructions) {
          for (const instruction of inlineInstructions) {
            node = createAnnotationElement(instruction.tag, instruction.props, [
              node,
            ])
          }
        }

        appendNode(node)
        currentPosition = sliceEnd
        // Close/open any frames exactly at the slice boundary so that the next
        // segment starts in the correct frame.
        processBoundary(currentPosition)
      }
    })

    const diagnosticNodes = renderDiagnostics({
      diagnostics: getUniqueDiagnostics(line),
      lineIndex,
      baseTokenClassName,
      theme,
      className,
      style,
    })

    for (const node of diagnosticNodes) {
      appendNode(node)
    }

    if (lineIndex < tokens.length - 1) {
      const newlineStart = currentPosition
      let newlineLength = 0

      if (value[newlineStart] === '\r' && value[newlineStart + 1] === '\n') {
        newlineLength = 2
      } else if (value[newlineStart] === '\n') {
        newlineLength = 1
      }

      if (newlineLength === 0) {
        // In some cases tokenization splits lines even when the source string
        // does not contain an actual newline character at this position (e.g.,
        // when formatting normalized whitespace). Render a visual newline but
        // do not advance the string position to keep indices aligned with the
        // original source string.
        appendText('\n')
      } else {
        appendText(value.slice(newlineStart, newlineStart + newlineLength))
        currentPosition += newlineLength
      }

      processBoundary(currentPosition)
    }
  })

  if (currentPosition < value.length) {
    advanceTo(value.length)
    appendText(value.slice(currentPosition))
  }

  processBoundary(currentPosition)

  // If any frames remain open due to minor index rounding
  // differences after formatting/mapping, don't drop their contents.
  // Instead, flush remaining children into the root in order.
  if (childrenStack.length > 1) {
    while (childrenStack.length > 1) {
      const children = childrenStack.pop() ?? []
      for (const child of children) {
        rootChildren.push(child)
      }
    }
  }

  return rootChildren
}

function joinClassNames(
  ...classNames: Array<string | undefined>
): string | undefined {
  let out: string | undefined
  for (let index = 0; index < classNames.length; index++) {
    const value = classNames[index]
    if (!value) continue
    if (out === undefined) out = value
    else out += ' ' + value
  }
  return out
}
