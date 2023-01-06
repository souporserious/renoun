// modified from: https://github.com/suren-atoyan/monaco-react/blob/master/src/Editor/Editor.js
import * as React from 'react'
import loader from '@monaco-editor/loader'
import { kebabCase } from 'case-anything'
import { initializeMonaco } from '../utils/initialize-monaco'

export type MonacoOptions = {
  containerRef: React.RefObject<HTMLElement>
  value?: string
  id?: number
  lineNumbers?: boolean
  folding?: boolean
  fontSize?: number
  focusRange?: { column: number; lineNumber: number }
  onChange?: (value: string) => void
  onMount?: () => void
}

export function useMonaco({
  containerRef,
  value,
  id,
  lineNumbers,
  folding,
  fontSize,
  focusRange,
  onChange,
  onMount,
}: MonacoOptions) {
  const [isMounting, setIsMounting] = React.useState(true)
  const monacoRef = React.useRef<any>(null)
  const editorRef = React.useRef<any>(null)

  React.useEffect(() => {
    const cancelable = loader.init()

    if (containerRef.current === null) {
      console.warn('Monaco initialization: containerRef.current is null')
      cancelable.cancel()
      return
    }

    cancelable
      .then(async (monaco) => {
        monacoRef.current = monaco
        editorRef.current = await initializeMonaco({
          container: containerRef.current!,
          monaco,
          defaultValue: value,
          id,
          lineNumbers,
          folding,
          fontSize,
          onOpenEditor: (input) => {
            const [base, filename] = input.resource.path
              .replace('/node_modules/', '') // trim node_modules prefix used by Monaco Editor
              .replace('.d.ts', '') // trim .d.ts suffix from decalaration
              .split('/') // finally split the path into an array
            if (base === 'components' || base === 'hooks') {
              window.open(
                filename === 'index'
                  ? `/${base}`
                  : `/${base}/${kebabCase(filename)}`,
                '_blank'
              )
            }
          },
        })
        if (onMount) {
          /**
           * Add delay to account for loading grammars
           * TODO: look into basing on actual grammar loading time
           */
          setTimeout(() => {
            onMount()
          }, 300)
        }
        setIsMounting(false)
      })
      .catch((error) => {
        if (error?.type !== 'cancelation') {
          console.error('Monaco initialization: error:', error)
        }
      })

    return () => {
      if (editorRef.current) {
        editorRef.current.getModel()?.dispose()
        editorRef.current.dispose()
      } else {
        cancelable.cancel()
      }
    }
  }, [])

  /** Focus the editor on mount. */
  React.useEffect(() => {
    if (isMounting || editorRef.current === null) return

    editorRef.current.focus()

    if (focusRange) {
      editorRef.current.setPosition(focusRange)
    }
  }, [isMounting])

  React.useEffect(() => {
    if (isMounting || editorRef.current === null) return

    const handleChange = editorRef.current.onDidChangeModelContent(() => {
      onChange?.(editorRef.current!.getValue())
    })

    return () => handleChange.dispose()
  }, [isMounting])

  React.useEffect(() => {
    if (isMounting || editorRef.current === null) return

    const handleKeyDown = editorRef.current.onKeyDown(async (event) => {
      /** Format file on save (metaKey + s) */
      if (event.keyCode === 49 && event.metaKey) {
        event.preventDefault()
        editorRef.current!.getAction('editor.action.formatDocument').run()
      }
    })

    return () => handleKeyDown.dispose()
  }, [isMounting])

  React.useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== value) {
      const currentModel = editorRef.current.getModel()
      if (currentModel) {
        editorRef.current.executeEdits('', [
          {
            range: currentModel.getFullModelRange(),
            text: value || null,
            forceMoveMarkers: true,
          },
        ])
        editorRef.current.pushUndoStop()
      } else if (value !== undefined) {
        editorRef.current.setValue(value)
      }
    }
  }, [value])
}
