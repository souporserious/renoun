// @ts-expect-error
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import React, { use, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { createStarryNight } from '@wooorm/starry-night'
import { Project, type SourceFile } from 'ts-morph'

import sourceTsx from './grammars/source.tsx'

const starryNightPromise = createStarryNight([sourceTsx])

const project = new Project({ useInMemoryFileSystem: true })
const languageService = project.getLanguageService().compilerObject
const isDocument = typeof document !== 'undefined'
const canvas = isDocument ? document.createElement('canvas') : null
const context = canvas?.getContext('2d')

context.font = '14px monospace'

fetch('/_next/static/mdxts/types.json').then(async (response) => {
  const typeDeclarations = await response.json()

  typeDeclarations.forEach(({ code, path }) => {
    project.createSourceFile(path, code)
  })
})

/** Code editor with syntax highlighting. */
export function Editor({
  language = 'typescript',
  scope = 'source.tsx',
  defaultValue,
  value,
  onChange,
}: {
  language?: string
  scope?: string
  theme?: any
  defaultValue?: string
  value?: string
  onChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
}) {
  const [stateValue, setStateValue] = useState(defaultValue)
  const [cursorPosition, setCursorPosition] = useState(null)
  const [row, setRow] = useState(null)
  const [column, setColumn] = useState(null)
  const [sourceFile, setSourceFile] = useState<SourceFile | null>(null)
  const textareaRef = useRef(null)
  const nextCursorPositionRef = useRef(null)
  const [suggestions, setSuggestions] = useState([])
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const starryNight = use(starryNightPromise)
  const resolvedValue = value ?? stateValue

  useEffect(() => {
    const nextSourceFile = project.createSourceFile(
      '/index.tsx',
      resolvedValue,
      { overwrite: true }
    )

    setSourceFile(nextSourceFile)
  }, [resolvedValue])

  useEffect(() => {
    setIsDropdownOpen(false)
    setHighlightedIndex(0)
  }, [cursorPosition])

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
    const beforeCursor = resolvedValue.substring(0, currentPosition)
    const afterCursor = resolvedValue.substring(currentPosition)
    const newValue = `${beforeCursor}${suggestion.name}${afterCursor}`
    setStateValue(newValue)
    setIsDropdownOpen(false)
    setHighlightedIndex(0)
    nextCursorPositionRef.current = currentPosition + suggestion.name.length
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (isDropdownOpen && event.key === 'ArrowUp') {
      event.preventDefault()
      let nextIndex = highlightedIndex - 1
      if (nextIndex < 0) {
        nextIndex = suggestions.length - 1
      }
      setHighlightedIndex(nextIndex)
    }

    if (isDropdownOpen && event.key === 'ArrowDown') {
      event.preventDefault()
      let nextIndex = highlightedIndex + 1
      if (nextIndex >= suggestions.length) {
        nextIndex = 0
      }
      setHighlightedIndex(nextIndex)
    }

    if (isDropdownOpen && event.key === 'Enter') {
      event.preventDefault()
      selectSuggestion(suggestions[highlightedIndex])
    }
  }

  function handleKeyUp(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const cursorPosition = textareaRef.current?.selectionStart || 0
    setCursorPosition(cursorPosition)

    if (event.key === ' ' && event.ctrlKey) {
      const currentSuggestions = getAutocompletions(cursorPosition)
      const lines = resolvedValue.substring(0, cursorPosition).split('\n')
      setRow(lines.length - 1)
      setColumn(lines.at(-1).length)
      setSuggestions(currentSuggestions)
      setIsDropdownOpen(currentSuggestions.length > 0)
    }
  }

  const [hoverInfo, setHoverInfo] = useState<{
    displayText: string
    docText: string
  } | null>(null)
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
    const column = Math.floor(cursorX / context.measureText(' ').width)
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
    const nodeVisualStart = context.measureText(nodeStartLineContent).width

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

        setHoverInfo({ displayText, docText })
        setHoverPosition({
          x: nodeVisualStart - context.measureText(' ').width,
          y: row * 20 - 10,
        })
      } else {
        setHoverInfo(null)
        setHoverPosition(null)
      }
    } catch (error) {
      // console.error(error)
    }
  }

  const sharedStyle = {
    gridArea: '1 / 1',
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    fontFamily: 'monospace',
    fontSize: 14,
    tabSize: 4,
    letterSpacing: '0px',
    lineHeight: '20px',
  } satisfies React.CSSProperties

  return (
    <div style={{ display: 'grid', width: '100%', position: 'relative' }}>
      <div style={sharedStyle}>
        {toJsxRuntime(starryNight.highlight(resolvedValue, scope), {
          jsx,
          jsxs,
          Fragment,
        })}
        {/\n[ \t]*$/.test(resolvedValue) ? <br /> : undefined}
      </div>
      <textarea
        ref={textareaRef}
        onPointerUp={() => {
          const cursorPosition = textareaRef.current?.selectionStart || 0
          setCursorPosition(cursorPosition)
        }}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => {
          setHoverInfo(null)
          setHoverPosition(null)
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
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
        }}
      />

      {isDropdownOpen && (
        <div
          style={{
            fontSize: 14,
            width: 200,
            maxHeight: 340,
            overflow: 'auto',
            position: 'absolute',
            top: row * 20 + 20,
            left: column * context.measureText(' ').width,
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
          {toJsxRuntime(starryNight.highlight(hoverInfo.displayText, scope), {
            jsx,
            jsxs,
            Fragment,
          })}
          <div>{hoverInfo.docText}</div>
        </div>
      )}
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
