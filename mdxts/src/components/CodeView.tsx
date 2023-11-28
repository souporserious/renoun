import React, { Fragment } from 'react'
import type { SourceFile } from 'ts-morph'
import { Identifier, SyntaxKind } from 'ts-morph'
import { type Theme } from './highlighter'
import { Symbol } from './Symbol'
import { QuickInfo } from './QuickInfo'
import { RegisterSourceFile } from './RegisterSourceFile'

export type CodeProps = {
  /** Code snippet to be highlighted. */
  value?: string

  /** Name of the file. */
  filename?: string

  /** Language of the code snippet. */
  language?: string

  /** Show or hide line numbers. */
  lineNumbers?: boolean

  /** Lines to highlight. */
  highlight?: string

  /** VS Code-based theme for highlighting. */
  theme?: Theme

  /** Show or hide errors. */
  showErrors?: boolean

  /** Class name to be applied to the code block. */
  className?: string
}

const lineHeight = 20

/** Renders a code block with syntax highlighting. */
export function CodeView({
  row,
  tokens,
  lineNumbers,
  sourceFile,
  filename,
  highlight,
  highlighter,
  language,
  theme,
  showErrors,
  isJsxOnly,
  className,
  isNestedInEditor,
  edit,
}: CodeProps & {
  row?: [number, number]
  tokens: any
  sourceFile?: SourceFile
  highlighter: any
  isJsxOnly?: boolean
  isNestedInEditor?: boolean
  edit?: any
}) {
  const identifierBounds = sourceFile
    ? getIdentifierBounds(sourceFile, isJsxOnly, lineHeight)
    : []
  const shouldHighlightLine = calculateLinesToHighlight(highlight)
  const diagnostics = sourceFile?.getPreEmitDiagnostics()
  const Container = isNestedInEditor
    ? React.Fragment
    : (props) => (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            position: 'relative',
          }}
          {...props}
        />
      )

  return (
    <Container>
      <RegisterSourceFile
        filename={filename}
        source={sourceFile?.getFullText()}
      />

      {lineNumbers ? (
        <div
          className={className}
          style={{
            gridColumn: 1,
            gridRow: 1,
            width: '6ch',
            fontSize: 14,
            lineHeight: '20px',
            paddingRight: '2ch',
            textAlign: 'right',
            userSelect: 'none',
            whiteSpace: 'pre',
            color: theme.colors['editorLineNumber.foreground'],
          }}
        >
          {tokens.map((_, lineIndex) => {
            const shouldHighlight = shouldHighlightLine(lineIndex)
            const isActive = row && row[0] <= lineIndex && lineIndex <= row[1]
            const Wrapper = ({ children }: { children: React.ReactNode }) =>
              shouldHighlight || isActive ? (
                <div
                  style={{
                    color: theme.colors['editorLineNumber.activeForeground'],
                  }}
                >
                  {children}
                </div>
              ) : (
                <Fragment>
                  {children}
                  {'\n'}
                </Fragment>
              )
            return <Wrapper key={lineIndex}>{lineIndex + 1}</Wrapper>
          })}
        </div>
      ) : null}

      <pre
        className={className}
        style={{
          gridColumn: 2,
          gridRow: 1,
          whiteSpace: 'pre',
          wordWrap: 'break-word',
          fontSize: 14,
          lineHeight: '20px',
          letterSpacing: '0px',
          tabSize: 4,
          padding: 0,
          margin: 0,
          borderRadius: 4,
          pointerEvents: 'none',
          position: 'relative',
          overflow: 'visible',
        }}
      >
        {identifierBounds.map((bounds, index) => {
          const filteredDiagnostics = diagnostics.filter((diagnostic) => {
            const start = diagnostic.getStart()
            const end = start + diagnostic.getLength()
            return start <= bounds.start && bounds.start <= end
          })
          const isQuickInfoOpen = showErrors && filteredDiagnostics.length > 0
          return (
            <Symbol
              key={index}
              isQuickInfoOpen={isQuickInfoOpen}
              style={{
                top: bounds.top,
                left: `calc(${bounds.left} * 1ch)`,
                width: `calc(${bounds.width} * 1ch)`,
                height: bounds.height,
              }}
            >
              <QuickInfo
                bounds={bounds}
                filename={filename}
                highlighter={highlighter}
                language={language}
                position={bounds.start}
                theme={theme}
                diagnostics={filteredDiagnostics}
                edit={edit}
                isQuickInfoOpen={isQuickInfoOpen}
              />
            </Symbol>
          )
        })}

        {tokens.map((line, lineIndex) => (
          <Fragment key={lineIndex}>
            {line.map((token, tokenIndex) => (
              <span
                key={tokenIndex}
                style={{
                  ...token.fontStyle,
                  color: token.color,
                  textDecoration: token.hasError
                    ? 'red wavy underline'
                    : 'none',
                }}
              >
                {token.content}
              </span>
            ))}
            {'\n'}
          </Fragment>
        ))}
      </pre>

      {highlight
        ? highlight
            .split(',')
            .map((range) => {
              const [start, end] = range.split('-')
              const parsedStart = parseInt(start, 10)
              const parsedEnd = end ? parseInt(end, 10) : parsedStart
              return {
                start: parsedStart,
                end: parsedEnd,
              }
            })
            .map((range, index) => {
              const start = range.start - 1
              const end = range.end ? range.end - 1 : start
              const top = start * lineHeight
              const height = (end - start + 1) * lineHeight

              return (
                <div
                  key={index}
                  style={{
                    position: 'absolute',
                    top,
                    left: 0,
                    width: '100%',
                    height,
                    backgroundColor: '#87add726',
                    pointerEvents: 'none',
                  }}
                />
              )
            })
        : null}
    </Container>
  )
}

/** Calculate which lines to highlight based on the range meta string added by the rehype plugin. */
function calculateLinesToHighlight(meta) {
  if (meta === undefined || meta === '') {
    return () => false
  }
  const lineNumbers = meta
    .split(',')
    .map((value) => value.split('-').map((y) => parseInt(y, 10)))

  return (index) => {
    const lineNumber = index + 1
    const inRange = lineNumbers.some(([start, end]) =>
      end ? lineNumber >= start && lineNumber <= end : lineNumber === start
    )
    return inRange
  }
}

/* Get the bounding rectangle of all identifiers in a source file. */
function getIdentifierBounds(
  sourceFile: SourceFile,
  isJsxOnly: boolean,
  lineHeight: number
) {
  const identifiers = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)
  const importCount = sourceFile.getImportDeclarations().length
  const bounds = identifiers
    .filter((identifier) => {
      const parent = identifier.getParent()
      const isJsxOnlyImport = isJsxOnly
        ? parent?.getKind() === SyntaxKind.ImportSpecifier ||
          parent?.getKind() === SyntaxKind.ImportClause
        : false
      return (
        !Identifier.isJSDocTag(parent) &&
        !Identifier.isJSDoc(parent) &&
        !isJsxOnlyImport
      )
    })
    .map((identifier) => {
      const start = identifier.getStart()
      const { line, column } = sourceFile.getLineAndColumnAtPos(start)
      const yOffset = isJsxOnly ? importCount + 2 : 1
      return {
        start,
        top: (line - yOffset) * lineHeight,
        left: column - 1,
        width: identifier.getWidth(),
        height: lineHeight,
      }
    })

  return bounds
}
