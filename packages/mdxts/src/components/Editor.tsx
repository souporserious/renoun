'use client'
import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useId,
  useState,
} from 'react'
import type { Diagnostic, SourceFile, ts } from 'ts-morph'
import { getDiagnosticMessageText } from '@tsxmod/utils'

import type { Highlighter, Theme, Tokens } from './highlighter'
import { getHighlighter } from './highlighter'
import { project, languageService } from './project'
import { CodeToolbar } from './CodeToolbar'
import { CodeView } from './CodeView'

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

export const languageMap: Record<string, any> = {
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
  if (!theme) {
    throw new Error(
      'The [theme] prop was not provided to the [Editor] component. Pass an explicit theme or make sure the mdxts/loader package is configured correctly.'
    )
  }

  const filenameId = useId()
  const filename = filenameProp || `index-${filenameId.slice(1, -1)}.tsx`
  const scopedFilename = `mdxts/${filename}`
  const language =
    languageProp && languageProp in languageMap
      ? languageMap[languageProp]
      : languageProp
  const [stateValue, setStateValue] = useState(defaultValue ?? '')
  const [tokens, setTokens] = useState<Tokens[]>([])
  const [row, setRow] = useState<number[] | null>(null)
  const [column, setColumn] = useState<number[] | null>(null)
  const [focus, setFocus] = useState(false)
  const [sourceFile, setSourceFile] = useState<SourceFile | undefined>(
    undefined
  )
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([])
  const [suggestions, setSuggestions] = useState<ts.CompletionEntry[]>([])
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

    async function init() {
      // Wait for the types to be fetched before creating declaration source files
      if (fetchPromise) {
        const response = await fetchPromise
        const typeDeclarations = (await response.clone().json()) as {
          path: string
          code: string
        }[]

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

    const nextSourceFile = project.createSourceFile(
      scopedFilename,
      resolvedValue,
      {
        overwrite: true,
      }
    )
    setSourceFile(nextSourceFile)

    if (isJavaScriptBasedLanguage) {
      const diagnostics = nextSourceFile.getPreEmitDiagnostics()
      setDiagnostics(diagnostics)

      if (highlighter && resolvedValue && sourceFile) {
        const tokens = highlighter(resolvedValue, language, sourceFile)
        setTokens(tokens)
      }
    } else if (highlighter && resolvedValue) {
      const tokens = highlighter(resolvedValue, language)
      setTokens(tokens)
    }
  }, [resolvedValue, highlighter])

  useEffect(() => {
    if (textareaRef.current && nextCursorPositionRef.current) {
      textareaRef.current.selectionStart = nextCursorPositionRef.current
      textareaRef.current.selectionEnd = nextCursorPositionRef.current
      nextCursorPositionRef.current = null
    }
  }, [stateValue])

  function getAutocompletions(position: number) {
    const completions = languageService.getCompletionsAtPosition(
      scopedFilename,
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

  function selectSuggestion(suggestion: any) {
    const currentPosition = textareaRef.current?.selectionStart || 0
    const beforeCursor = resolvedValue?.substring(0, currentPosition)
    const match = beforeCursor?.match(/[a-zA-Z_]+$/)
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
      const lastChar = resolvedValue?.at(-1)

      // don't trigger suggestions if there is space before the cursor
      if (
        lastChar &&
        (!/^[a-zA-Z.]$/.test(lastChar) || ['\n', ' '].includes(lastChar))
      ) {
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
      <CodeToolbar filename={filename} value={resolvedValue} theme={theme} />
      <div
        ref={scrollRef}
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr)',
          padding: '10px 0',
          // overflow: 'auto',
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
              filename={scopedFilename}
              highlighter={highlighter}
              highlight={highlight}
              language={language}
              theme={theme}
              value={resolvedValue}
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
            top: row ? row[0] * 20 + 80 : 80,
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
            fontSize: 'var(--font-size-body-2)',
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

function getCaretPositions(textarea: HTMLTextAreaElement) {
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

function getPositionFromText(text: string) {
  const lines = text.split('\n')
  const row = lines.length - 1
  const col = lines[lines.length - 1].length + 1
  return { row, col }
}
