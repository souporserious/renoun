'use client'
import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useId,
  useState,
} from 'react'
import type { Diagnostic, SourceFile } from 'ts-morph'
import { useMdxtsContext } from '../../context'
import { getDiagnosticMessageText } from '../diagnostics'
import type { Highlighter, Theme, Tokens } from '../highlighter'
import { getHighlighter } from '../highlighter'
import { project, languageService } from '../project'
import { CodeView } from '../CodeView'

const isClient = typeof document !== 'undefined'
let fetchPromise = isClient ? fetch('/_next/static/mdxts/types.json') : null

export type EditorProps = {
  /** Default value of the editor. */
  defaultValue?: string

  /** Controlled value of the editor. */
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

  /** Class name to be applied to the code block. */
  className?: string

  /** Callback when the editor value changes. */
  onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
}

const languageMap = {
  shell: 'shellscript',
  bash: 'shellscript',
  mjs: 'javascript',
}

/** Code editor with syntax highlighting. */
export function Editor({
  language: languageProp,
  defaultValue,
  value,
  filename: filenameProp,
  lineNumbers,
  highlight,
  onChange,
  theme,
  className,
  children,
}: EditorProps & { children?: React.ReactNode }) {
  const mdxtsContext = useMdxtsContext()
  const filenameId = useId()
  const filename = filenameProp || `index-${filenameId.slice(1, -1)}.tsx`
  const language = languageMap[languageProp] || languageProp
  const [stateValue, setStateValue] = useState(defaultValue)
  const [tokens, setTokens] = useState<Tokens[]>([])
  const [row, setRow] = useState(null)
  const [focus, setFocus] = useState(false)
  const [column, setColumn] = useState(null)
  const [sourceFile, setSourceFile] = useState<SourceFile | null>(null)
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [suggestions, setSuggestions] = useState([])
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [highlighter, setHighlighter] = useState<Highlighter | null>(null)
  const ctrlKeyRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const nextCursorPositionRef = useRef(null)
  const resolvedValue = value ?? stateValue
  const isJavaScriptBasedLanguage = [
    'javascript',
    'js',
    'jsx',
    'typescript',
    'ts',
    'tsx',
  ].some((languageToCompare) => languageToCompare === language)

  useLayoutEffect(() => {
    // Editor currently only supports highlighting JavaScript-based languages
    if (!isJavaScriptBasedLanguage) {
      return
    }

    // Add code blocks to the project
    mdxtsContext.codeBlocks.map(({ value, filename }) => {
      project.createSourceFile(filename, value, { overwrite: true })
    })

    async function init() {
      // Wait for the types to be fetched before creating declaration source files
      if (fetchPromise) {
        const response = await fetchPromise
        const typeDeclarations = await response.clone().json()

        typeDeclarations.forEach(({ path, code }) => {
          project.createSourceFile(path, code, { overwrite: true })
        })

        fetchPromise = null
      }

      const highlighter = await getHighlighter({
        theme,
        langs: [
          'javascript',
          'js',
          'jsx',
          'typescript',
          'ts',
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

      setHighlighter(() => highlighter)
    }
    init()
  }, [])

  useLayoutEffect(() => {
    if (highlighter === null) {
      return
    }

    const nextSourceFile = project.createSourceFile(filename, resolvedValue, {
      overwrite: true,
    })
    setSourceFile(nextSourceFile)

    if (isJavaScriptBasedLanguage) {
      const diagnostics = nextSourceFile.getPreEmitDiagnostics()
      setDiagnostics(diagnostics)

      if (highlighter) {
        const tokens = highlighter(resolvedValue, language, sourceFile)
        setTokens(tokens)
      }
    } else if (highlighter) {
      const tokens = highlighter(resolvedValue, language)
      setTokens(tokens)
    }
  }, [resolvedValue, highlighter])

  useEffect(() => {
    if (nextCursorPositionRef.current) {
      textareaRef.current.selectionStart = nextCursorPositionRef.current
      textareaRef.current.selectionEnd = nextCursorPositionRef.current
      nextCursorPositionRef.current = null
    }
  }, [stateValue])

  function getAutocompletions(position) {
    const completions = languageService.getCompletionsAtPosition(
      filename,
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
    const beforeCursor = resolvedValue.substring(0, currentPosition)
    const match = beforeCursor.match(/[a-zA-Z_]+$/)
    const prefix = match ? match[0] : ''

    for (let index = 0; index < prefix.length; index++) {
      document.execCommand('delete', false)
    }

    document.execCommand('insertText', false, suggestion.name)
    setIsDropdownOpen(false)
    setHighlightedIndex(0)
  }

  function handleCaretPosition(event: React.FormEvent<HTMLTextAreaElement>) {
    const { row, col } = getCaretPositions(event.currentTarget)
    setRow(row)
    setColumn(col)
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
    handleCaretPosition(event)

    if (
      /^[a-zA-Z.]$/.test(event.key) ||
      event.key === 'Backspace' ||
      (event.key === ' ' && ctrlKeyRef.current)
    ) {
      const lastChar = resolvedValue.at(-1)

      // don't trigger suggestions if there is space before the cursor
      if (!/^[a-zA-Z.]$/.test(lastChar) || ['\n', ' '].includes(lastChar)) {
        setIsDropdownOpen(false)
      } else {
        const cursorPosition = textareaRef.current?.selectionStart || 0
        const currentSuggestions = getAutocompletions(cursorPosition)
        setSuggestions(currentSuggestions)
        setIsDropdownOpen(currentSuggestions.length > 0)
      }
    }
  }

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        color: theme.colors['editor.foreground'],
        backgroundColor: theme.colors['editor.background'],
        border: '1px solid #293742',
        borderRadius: 4,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          borderBottom: '1px solid #293742',
        }}
      >
        {filenameProp ? (
          <div
            style={{
              fontSize: '0.8rem',
              padding: '0.8rem 1rem',
            }}
          >
            {filename}
          </div>
        ) : null}
        <button
          onClick={() => {
            navigator.clipboard.writeText(resolvedValue)
          }}
          style={{
            backgroundColor: 'transparent',
            padding: '0.8rem',
            border: 0,
          }}
        >
          <svg
            aria-hidden="true"
            focusable="false"
            role="img"
            viewBox="0 0 16 16"
            width="12"
            height="12"
            fill="white"
          >
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path>
            <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path>
          </svg>
        </button>
      </div>
      <div
        ref={scrollRef}
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          padding: '10px 0',
          overflow: 'auto',
        }}
      >
        <>
          {stateValue === defaultValue && children && !focus ? (
            children
          ) : (
            <CodeView
              row={row}
              tokens={tokens}
              lineNumbers={lineNumbers}
              sourceFile={sourceFile}
              filename={filename}
              highlighter={highlighter}
              highlight={highlight}
              language={language}
              theme={theme}
              isNestedInEditor
            />
          )}
        </>
        <textarea
          ref={textareaRef}
          onInput={handleCaretPosition}
          onPointerMove={handleCaretPosition}
          onPointerUp={handleCaretPosition}
          onKeyDown={handleKeyDown}
          onKeyUp={isJavaScriptBasedLanguage ? handleKeyUp : undefined}
          onFocus={(event: React.FocusEvent<HTMLTextAreaElement>) => {
            setFocus(true)
            handleCaretPosition(event)
          }}
          onBlur={() => {
            setFocus(false)
            setIsDropdownOpen(false)
          }}
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
            gridColumn: 2,
            gridRow: 1,
            whiteSpace: 'pre',
            wordWrap: 'break-word',
            fontFamily: 'inherit',
            fontSize: 14,
            lineHeight: '20px',
            letterSpacing: '0px',
            tabSize: 4,
            padding: 0,
            borderRadius: 4,
            border: 0,
            backgroundColor: 'transparent',
            color: 'transparent',
            resize: 'none',
            outline: 'none',
            overflow: 'visible',
            caretColor: theme.colors['editorCursor.foreground'],
          }}
        />
      </div>

      {isDropdownOpen && (
        <ul
          style={{
            listStyle: 'none',
            fontSize: 14,
            width: 200,
            maxHeight: 340,
            padding: 0,
            margin: 0,
            overflow: 'auto',
            position: 'absolute',
            top: row * 20 + 80,
            left: `calc(${column} * 1ch + 6ch)`,
            zIndex: 1000,
            borderRadius: 3,
            border: `1px solid ${theme.colors['editorHoverWidget.border']}`,
            backgroundColor: theme.colors['editorHoverWidget.background'],
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
        </ul>
      )}

      {diagnostics.length > 0 ? (
        <ul
          style={{
            listStyle: 'none',
            fontSize: '0.8rem',
            padding: '0.6rem',
            margin: 0,
            backgroundColor: 'red',
          }}
        >
          {diagnostics.map((diagnostic, index) => (
            <li key={index}>
              {getDiagnosticMessageText(diagnostic.getMessageText())}
            </li>
          ))}
        </ul>
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
  const ref = useRef<HTMLLIElement>(null)

  useLayoutEffect(() => {
    if (isHighlighted) {
      ref.current?.scrollIntoView({ block: 'nearest' })
    }
  }, [isHighlighted])

  return (
    <li
      ref={ref}
      onClick={onClick}
      style={{
        padding: 2,
        backgroundColor: isHighlighted ? '#0086ffbd' : 'transparent',
      }}
    >
      {suggestion.name}
    </li>
  )
}

function getCaretPositions(textarea) {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const textBeforeStart = textarea.value.substring(0, start)
  const textBeforeEnd = textarea.value.substring(0, end)
  const startPosition = getPositionFromText(textBeforeStart)
  const endPosition = getPositionFromText(textBeforeEnd)

  return {
    row: [startPosition.row, endPosition.row],
    col: [startPosition.col, endPosition.col],
  }
}

function getPositionFromText(text) {
  const lines = text.split('\n')
  const row = lines.length - 1
  const col = lines[lines.length - 1].length + 1
  return { row, col }
}
