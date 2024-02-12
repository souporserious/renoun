import 'react'

declare module 'react' {
  interface CSSProperties {
    '--scale'?: string | number
  }
}
