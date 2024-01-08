'use client'
import React, {
  createContext,
  useContext,
  useRef,
  useEffect,
  useState,
} from 'react'

const PreContext = createContext(false)

export function usePreContext() {
  return useContext(PreContext)
}

export function Pre({
  children,
  style,
  inline,
  isNestedInEditor,
  ...props
}: {
  inline?: boolean
  isNestedInEditor: boolean
} & React.HTMLProps<HTMLPreElement>) {
  const [pointerDown, setPointerDown] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const cancelPointerDown = () => {
    // allow enough time for text selection
    timeoutRef.current = setTimeout(() => setPointerDown(false), 200)
  }
  const Element = inline ? 'span' : 'pre'

  useEffect(() => {
    return () => {
      clearTimeout(timeoutRef.current)
    }
  }, [])

  return (
    <Element
      {...props}
      onPointerDown={() => setPointerDown(true)}
      onPointerUp={cancelPointerDown}
      onPointerCancel={cancelPointerDown}
      style={{
        display: inline ? 'inline-flex' : 'flex',
        gridColumn: 2,
        gridRow: 1,
        whiteSpace: 'pre',
        wordWrap: 'break-word',
        fontSize: '1rem',
        lineHeight: '1.4rem',
        letterSpacing: '0px',
        tabSize: 4,
        padding: 0,
        margin: 0,
        borderRadius: 4,
        pointerEvents: isNestedInEditor ? 'none' : undefined,
        position: 'relative',
        ...style,
      }}
    >
      <PreContext.Provider value={pointerDown}>{children}</PreContext.Provider>
    </Element>
  )
}
