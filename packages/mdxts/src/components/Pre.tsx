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
  isNestedInEditor,
  ...props
}: {
  isNestedInEditor: boolean
} & React.HTMLProps<HTMLPreElement>) {
  const [pointerDown, setPointerDown] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const cancelPointerDown = () => {
    // allow enough time for text selection
    timeoutRef.current = setTimeout(() => setPointerDown(false), 200)
  }

  useEffect(() => {
    return () => {
      clearTimeout(timeoutRef.current)
    }
  }, [])

  return (
    <pre
      {...props}
      onPointerDown={() => setPointerDown(true)}
      onPointerUp={cancelPointerDown}
      onPointerCancel={cancelPointerDown}
      style={{
        display: 'flex',
        gridColumn: 2,
        gridRow: 1,
        whiteSpace: 'pre',
        wordWrap: 'break-word',
        fontSize: 'var(--font-size-body-2)',
        lineHeight: 'var(--line-height-body-2)',
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
    </pre>
  )
}
