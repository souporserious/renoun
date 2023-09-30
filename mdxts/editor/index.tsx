// @ts-expect-error
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import React, { use, useEffect, useRef, useState } from 'react'
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
  const [suggestions, setSuggestions] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
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
    setShowDropdown(false)
  }, [cursorPosition])

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

  function handleSuggestionClick(suggestion) {
    console.log(suggestion)
    const currentPos = textareaRef.current?.selectionStart || 0
    const beforeCursor = resolvedValue.substring(0, currentPos)
    const afterCursor = resolvedValue.substring(currentPos)
    const newValue = `${beforeCursor}${suggestion.name}${afterCursor}`
    setStateValue(newValue)
    setShowDropdown(false)
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
      setShowDropdown(currentSuggestions.length > 0)
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

  function handleMouseMove(
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
          y: row * 20 + 10, // TODO: position on top similar to VS Code
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
        onMouseMove={handleMouseMove}
        onKeyUp={handleKeyUp}
        onBlur={() => setShowDropdown(false)}
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

      {showDropdown && (
        <div
          style={{
            fontSize: 14,
            width: 200,
            height: 340,
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
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.name}
              onClick={() => handleSuggestionClick(suggestion)}
            >
              {suggestion.name}
            </div>
          ))}
        </div>
      )}

      {hoverInfo && hoverPosition && (
        <div
          style={{
            position: 'absolute',
            left: hoverPosition.x + 10,
            top: hoverPosition.y + 10,
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

      {process.env.NODE_ENV === 'development' ? (
        <div>
          <div>Position: {cursorPosition}</div>
          <div>Row: {row}</div>
          <div>Column: {column}</div>
        </div>
      ) : null}
    </div>
  )
}
