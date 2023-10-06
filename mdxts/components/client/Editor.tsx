import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  Diagnostic,
  Project,
  ts,
  type SourceFile,
  type DiagnosticMessageChain,
} from 'ts-morph'
import { getHighlighter } from 'shiki'

const project = new Project({
  compilerOptions: {
    resolveJsonModule: true,
    esModuleInterop: true,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.ReactJSX,
    jsxImportSource: 'react',
  },
  useInMemoryFileSystem: true,
})
const languageService = project.getLanguageService().compilerObject
const isClient = typeof document !== 'undefined'
const canvas = isClient ? document.createElement('canvas') : null
const context = canvas?.getContext('2d')
const FontStyle = {
  Italic: 1,
  Bold: 2,
  Underline: 4,
  Strikethrough: 8,
}
let fetchPromise = isClient ? fetch('/_next/static/mdxts/types.json') : null

function getFontStyle(fontStyle: number): any {
  const style = {}
  if (fontStyle === FontStyle.Italic) {
    style['fontStyle'] = 'italic'
  }
  if (fontStyle === FontStyle.Bold) {
    style['fontWeight'] = 'bold'
  }
  if (fontStyle === FontStyle.Underline) {
    style['textDecoration'] = 'underline'
  }
  if (fontStyle === FontStyle.Strikethrough) {
    style['textDecoration'] = 'line-through'
  }
  return style
}

function hasDiagnosticsForToken(
  token: any,
  tokenIndex: number,
  lineIndex: number,
  tokens: any[],
  diagnostics: Diagnostic[],
  content: string
) {
  const linesBeforeToken = content.split('\n').slice(0, lineIndex)
  const charsBeforeTokenLine = linesBeforeToken.reduce(
    (sum, line) => sum + line.length + 1, // +1 for the newline character
    0
  )

  // Calculate position of the token within its line by summing up lengths of previous tokens in the same line
  const positionWithinLine = tokens[lineIndex]
    .slice(0, tokenIndex)
    .reduce((sum, prevToken) => sum + prevToken.content.length, 0)
  const tokenStart = charsBeforeTokenLine + positionWithinLine

  const tokenEnd = tokenStart + token.content.length

  // Iterate over the diagnostics to see if any of them overlap with the token's position.
  for (let diagnostic of diagnostics) {
    const diagnosticStart = diagnostic.getStart()
    const diagnosticEnd = diagnosticStart + diagnostic.getLength()

    if (
      (diagnosticStart >= tokenStart && diagnosticStart <= tokenEnd) ||
      (diagnosticEnd >= tokenStart && diagnosticEnd <= tokenEnd) ||
      (diagnosticStart <= tokenStart && diagnosticEnd >= tokenEnd)
    ) {
      return true
    }
  }

  return false
}

function getDiagnosticMessageText(
  message: string | DiagnosticMessageChain
): string {
  if (typeof message === 'string') {
    return message
  } else {
    const nextMessage = message.getNext()
    let result = message.getMessageText()

    if (Array.isArray(nextMessage)) {
      for (const msg of nextMessage) {
        result += '\n' + getDiagnosticMessageText(msg)
      }
    } else if (nextMessage) {
      result += '\n' + getDiagnosticMessageText(nextMessage)
    }

    return result
  }
}

if (context) {
  context.font = '14px monospace'
}

export type EditorProps = {
  /** Default value of the editor. */
  defaultValue?: string

  /** Controlled value of the editor. */
  value?: string

  /** Language of the code snippet. */
  language?: string

  /** VS Code-based theme for highlighting. */
  theme?: Parameters<typeof getHighlighter>[0]['theme']

  /** Callback when the editor value changes. */
  onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
}

const languageMap = {
  shell: 'shellscript',
  bash: 'shellscript',
}

/** Code editor with syntax highlighting. */
export function Editor({
  language: languageProp,
  defaultValue,
  value,
  onChange,
  theme,
  children,
}: EditorProps & { children?: React.ReactNode }) {
  const language = languageMap[languageProp] || languageProp
  const [stateValue, setStateValue] = useState(defaultValue)
  const [tokens, setTokens] = useState<
    ReturnType<Awaited<ReturnType<typeof getHighlighter>>['codeToThemedTokens']>
  >([])
  const [row, setRow] = useState(null)
  const [column, setColumn] = useState(null)
  const [sourceFile, setSourceFile] = useState<SourceFile | null>(null)
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const highlighterRef = useRef<Awaited<
    ReturnType<typeof getHighlighter>
  > | null>(null)
  const ctrlKeyRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const nextCursorPositionRef = useRef(null)
  const [suggestions, setSuggestions] = useState([])
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const resolvedValue = value ?? stateValue

  useLayoutEffect(() => {
    ;(async function init() {
      const highlighter = await getHighlighter({
        theme,
        langs: [
          'javascript',
          'jsx',
          'typescript',
          'tsx',
          'css',
          'json',
          'shellscript',
        ],
        paths: {
          languages: '/_next/static/mdxts',
          wasm: '/_next/static/mdxts',
        },
      })

      highlighterRef.current = highlighter

      const tokens = highlighter.codeToThemedTokens(resolvedValue, language)

      setTokens(tokens)
    })()
  }, [])

  useEffect(() => {
    async function init() {
      // Wait for the types to be fetched before creating declaration source files
      if (fetchPromise) {
        const response = await fetchPromise
        const typeDeclarations = await response.json()

        typeDeclarations.forEach(({ path, code }) => {
          project.createSourceFile(path, code)
        })

        fetchPromise = null
      }

      const nextSourceFile = project.createSourceFile(
        '/index.tsx',
        resolvedValue,
        { overwrite: true }
      )
      setSourceFile(nextSourceFile)

      const diagnostics = nextSourceFile.getPreEmitDiagnostics()
      setDiagnostics(diagnostics)

      if (highlighterRef.current) {
        const tokens = highlighterRef.current.codeToThemedTokens(
          resolvedValue,
          language
        )

        setTokens(tokens)
      }
    }
    init()
  }, [resolvedValue])

  useEffect(() => {
    if (nextCursorPositionRef.current) {
      textareaRef.current.selectionStart = nextCursorPositionRef.current
      textareaRef.current.selectionEnd = nextCursorPositionRef.current
      nextCursorPositionRef.current = null
    }
  }, [stateValue])

  function getAutocompletions(position) {
    const completions = languageService.getCompletionsAtPosition(
      '/index.tsx',
      position,
      {
        includeCompletionsForModuleExports: false,
        includeCompletionsWithInsertText: false,
        includeCompletionsWithSnippetText: false,
        includeInsertTextCompletions: false,
        includeExternalModuleExports: false,
        providePrefixAndSuffixTextForRename: false,
        triggerCharacter: '.',
      }
    )
    return completions ? completions.entries : []
  }

  function selectSuggestion(suggestion) {
    const currentPosition = textareaRef.current?.selectionStart || 0
    const regex = /[a-zA-Z_]+$/
    const beforeCursor = resolvedValue.substring(0, currentPosition)
    const match = beforeCursor.match(regex)
    const prefix = match ? match[0] : ''

    for (let i = 0; i < prefix.length; i++) {
      document.execCommand('delete', false)
    }

    document.execCommand('insertText', false, suggestion.name)
    setIsDropdownOpen(false)
    setHighlightedIndex(0)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!isDropdownOpen) {
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      let nextIndex = highlightedIndex - 1
      if (nextIndex < 0) {
        nextIndex = suggestions.length - 1
      }
      setHighlightedIndex(nextIndex)
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      let nextIndex = highlightedIndex + 1
      if (nextIndex >= suggestions.length) {
        nextIndex = 0
      }
      setHighlightedIndex(nextIndex)
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      selectSuggestion(suggestions[highlightedIndex])
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setIsDropdownOpen(false)
      setHighlightedIndex(0)
    }

    ctrlKeyRef.current = event.ctrlKey
  }

  function handleKeyUp(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (
      /^[a-zA-Z.]$/.test(event.key) ||
      event.key === 'Backspace' ||
      (event.key === ' ' && ctrlKeyRef.current)
    ) {
      const cursorPosition = textareaRef.current?.selectionStart || 0
      const lastChar = resolvedValue.at(-1)
      const lines = resolvedValue.substring(0, cursorPosition).split('\n')
      setRow(lines.length - 1)
      setColumn(lines.at(-1).length)

      // don't trigger suggestions if there is space before the cursor
      if (!/^[a-zA-Z.]$/.test(lastChar) || ['\n', ' '].includes(lastChar)) {
        setIsDropdownOpen(false)
      } else {
        const currentSuggestions = getAutocompletions(cursorPosition)
        setSuggestions(currentSuggestions)
        setIsDropdownOpen(currentSuggestions.length > 0)
      }
    }
  }

  const [hoverInfo, setHoverInfo] = useState<React.ReactNode | null>(null)
  const [hoverPosition, setHoverPosition] = useState<{
    x: number
    y: number
  } | null>(null)

  function handlePointerMove(
    event: React.MouseEvent<HTMLTextAreaElement, MouseEvent>
  ) {
    const rect = event.currentTarget.getBoundingClientRect()
    const cursorX = event.clientX - rect.left
    const cursorY = event.clientY - rect.top
    const row = Math.floor(cursorY / 20)
    const lineText = resolvedValue.split('\n')[row] || ''
    const column = Math.min(
      Math.floor(cursorX / context?.measureText(' ').width),
      lineText.length
    )
    const linesBeforeCursor = resolvedValue.split('\n').slice(0, row)
    const charsBeforeCurrentRow = linesBeforeCursor.reduce(
      (acc, line) => acc + line.length + 1,
      0
    )
    const position = charsBeforeCurrentRow + column
    const node = sourceFile.getDescendantAtPos(position)

    if (!node) {
      setHoverInfo(null)
      setHoverPosition(null)
      return
    }

    const nodeStartLineContent = resolvedValue.substring(
      charsBeforeCurrentRow,
      node.getStart()
    )
    const nodeVisualStart = context?.measureText(nodeStartLineContent).width

    try {
      const quickInfo = languageService.getQuickInfoAtPosition(
        'index.tsx',
        position
      )

      if (quickInfo) {
        const displayParts = quickInfo.displayParts || []
        const documentation = quickInfo.documentation || []
        const displayText = displayParts.map((part) => part.text).join('')
        const docText = documentation.map((part) => part.text).join('')
        const displayTextTokens = highlighterRef.current.codeToThemedTokens(
          displayText,
          language
        )

        setHoverInfo(
          <div>
            {displayTextTokens.map((line, index) => {
              return (
                <div key={index}>
                  {line.map((token, index) => {
                    return (
                      <span key={index} style={{ color: token.color }}>
                        {token.content}
                      </span>
                    )
                  })}
                </div>
              )
            })}
            {docText ? <p style={{ margin: 0 }}>{docText}</p> : null}
          </div>
        )

        const xOffset = scrollRef.current?.scrollLeft ?? 0
        const yOffset = scrollRef.current?.scrollTop ?? 0

        setHoverPosition({
          x: nodeVisualStart - context?.measureText(' ').width - xOffset,
          y: row * 20 - 10 - yOffset,
        })
      } else {
        setHoverInfo(null)
        setHoverPosition(null)
      }
    } catch (error) {
      console.error(error)
    }
  }

  const isJavaScriptBasedLanguage = [
    'javascript',
    'jsx',
    'typescript',
    'tsx',
  ].some((languageToCompare) => languageToCompare === language)

  const sharedStyle = {
    gridArea: '1 / 1',
    whiteSpace: 'pre',
    wordWrap: 'break-word',
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: '20px',
    letterSpacing: '0px',
    tabSize: 4,
    backgroundColor: '#101218',
  } satisfies React.CSSProperties

  return (
    <div style={{ position: 'relative' }}>
      <div ref={scrollRef} style={{ display: 'grid', overflow: 'auto' }}>
        <div style={sharedStyle}>
          {stateValue === defaultValue && children
            ? children
            : tokens.map((line, lineIndex) => {
                return (
                  <div key={lineIndex} style={{ height: 20 }}>
                    {line.map((token, tokenIndex) => {
                      const hasError = hasDiagnosticsForToken(
                        token,
                        tokenIndex,
                        lineIndex,
                        tokens,
                        diagnostics,
                        resolvedValue
                      )
                      const fontStyle = getFontStyle(token.fontStyle)
                      return (
                        <span
                          key={tokenIndex}
                          style={{
                            ...fontStyle,
                            color: token.color,
                            textDecoration: hasError
                              ? 'red wavy underline'
                              : 'none',
                          }}
                        >
                          {token.content}
                        </span>
                      )
                    })}
                  </div>
                )
              })}
        </div>
        <textarea
          ref={textareaRef}
          onPointerMove={
            isJavaScriptBasedLanguage ? handlePointerMove : undefined
          }
          onPointerLeave={() => {
            setHoverInfo(null)
            setHoverPosition(null)
          }}
          onKeyDown={handleKeyDown}
          onKeyUp={isJavaScriptBasedLanguage ? handleKeyUp : undefined}
          onBlur={() => setIsDropdownOpen(false)}
          onChange={
            defaultValue
              ? (event: React.ChangeEvent<HTMLTextAreaElement>) => {
                  setStateValue(event.target.value)
                  onChange?.(event)
                }
              : onChange
          }
          spellCheck="false"
          className="write"
          value={resolvedValue}
          rows={resolvedValue.split('\n').length + 1}
          style={{
            ...sharedStyle,
            padding: 0,
            border: 0,
            backgroundColor: 'transparent',
            color: 'transparent',
            caretColor: '#79c0ff',
            resize: 'none',
            outline: 'none',
            overflow: 'visible',
          }}
        />
      </div>

      {isDropdownOpen && (
        <div
          style={{
            fontSize: 14,
            width: 200,
            maxHeight: 340,
            overflow: 'auto',
            position: 'absolute',
            top: row * 20 + 20,
            left: column * context?.measureText(' ').width,
            zIndex: 1000,
            color: 'white',
            backgroundColor: 'black',
            border: '1px solid white',
          }}
        >
          {suggestions.map((suggestion, index) => {
            const isHighlighted = index === highlightedIndex
            return (
              <Suggestion
                key={suggestion.name}
                onClick={() => selectSuggestion(suggestion)}
                isHighlighted={isHighlighted}
                suggestion={suggestion}
              />
            )
          })}
        </div>
      )}

      {hoverInfo && hoverPosition && (
        <div
          style={{
            position: 'absolute',
            left: hoverPosition.x + 10,
            top: hoverPosition.y + 10,
            translate: '0px -100%',
            color: 'white',
            fontSize: 14,
            backgroundColor: 'black',
            border: '1px solid white',
            borderRadius: 1,
            padding: 4,
            zIndex: 1000,
          }}
        >
          {hoverInfo}
        </div>
      )}

      {diagnostics.length > 0 ? (
        <p
          style={{
            fontSize: '0.6rem',
            padding: '0.6rem',
            margin: 0,
            backgroundColor: 'red',
          }}
        >
          {diagnostics.map((diagnostic) =>
            getDiagnosticMessageText(diagnostic.getMessageText())
          )}
        </p>
      ) : null}
    </div>
  )
}

function Suggestion({
  suggestion,
  isHighlighted,
  onClick,
}: {
  suggestion: any
  isHighlighted: boolean
  onClick: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (isHighlighted) {
      ref.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [isHighlighted])

  return (
    <div
      ref={ref}
      onClick={onClick}
      style={{
        padding: 2,
        backgroundColor: isHighlighted ? '#0086ffbd' : 'transparent',
      }}
    >
      {suggestion.name}
    </div>
  )
}
