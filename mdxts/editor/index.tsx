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
  const [tsEnv, setTsEnv] = useState(null)
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

  function getAutocompletions(position) {
    const completions = languageService.getCompletionsAtPosition(
      '/index.tsx',
      position,
      {
        includeCompletionsForModuleExports: true,
        includeCompletionsWithInsertText: true,
        includeCompletionsWithSnippetText: true,
        providePrefixAndSuffixTextForRename: false,
      }
    )
    return completions ? completions.entries : []
  }

  function handleTextareaChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const cursorPosition = event.target.selectionStart
    const currentSuggestions = getAutocompletions(cursorPosition)
    setSuggestions(currentSuggestions)
    setShowDropdown(currentSuggestions.length > 0)
    setStateValue(event.target.value)
  }

  function handleSuggestionClick(suggestion) {
    const currentPos = textareaRef.current?.selectionStart || 0
    const beforeCursor = resolvedValue.substring(0, currentPos)
    const afterCursor = resolvedValue.substring(currentPos)
    const newValue = `${beforeCursor}${suggestion.name}${afterCursor}`
    setStateValue(newValue)
    setShowDropdown(false)
  }

  function handleKeydown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === '.' || (event.key.length === 1 && /\w/.test(event.key))) {
      const cursorPosition = textareaRef.current?.selectionStart || 0
      const currentSuggestions = getAutocompletions(
        event.key.length === 1 ? cursorPosition + 1 : cursorPosition
      )
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

  function handleSymbolHover(
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
    // const positions = sourceFile.getLineAndColumnAtPos(position)
    try {
      // const node = sourceFile.getDescendantAtPos(position)
      // console.log(node.getText())
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
        setHoverPosition({ x: event.clientX, y: event.clientY })
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
    <div style={{ display: 'grid', width: '100%' }}>
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
        onMouseMove={handleSymbolHover}
        onKeyDown={handleKeydown}
        onBlur={() => setShowDropdown(false)}
        // onChange={handleTextareaChange}
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
            position: 'fixed',
            top: 0,
            right: 0,
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
            position: 'fixed',
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
    </div>
  )
}
