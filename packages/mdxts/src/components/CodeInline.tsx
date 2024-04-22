export type CodeInlineProps = {}

export function CodeInline(props: any) {
  return null
}

// import React, { Fragment } from 'react'
// import { BUNDLED_LANGUAGES } from 'shiki'
// import 'server-only'

// import { getTheme } from '../utils/get-theme'
// import { getHighlighter } from './highlighter'

// const languageMap: Record<string, any> = {
//   mjs: 'javascript',
// }
// const languageKeys = Object.keys(languageMap)

// export type CodeInlineProps = {
//   /** Code snippet to be highlighted. */
//   value: string

//   /** Language of the code snippet. */
//   language?: (typeof BUNDLED_LANGUAGES)[number] | (typeof languageKeys)[number]

//   /** Padding to apply to the wrapping element. */
//   padding?: string

//   /** Horizontal padding to apply to the wrapping element. */
//   paddingHorizontal?: string

//   /** Vertical padding to apply to the wrapping element. */
//   paddingVertical?: string

//   /** Class name to apply to the wrapping element. */
//   className?: string

//   /** Style to apply to the wrapping element. */
//   style?: React.CSSProperties
// }

// /** Renders a `code` element with syntax highlighting. */
// export async function CodeInline({
//   language,
//   className,
//   padding = '0.25rem',
//   paddingHorizontal = padding,
//   paddingVertical = padding,
//   style,
//   ...props
// }: CodeInlineProps) {
//   const theme = getTheme()

//   let finalValue: string = props.value
//     // Trim extra whitespace from inline code blocks since it's difficult to read.
//     .replace(/\s+/g, ' ')
//   let finalLanguage =
//     (typeof language === 'string' && language in languageMap
//       ? languageMap[language]
//       : language) || 'plaintext'
//   const highlighter = await getHighlighter()
//   const tokens = highlighter(finalValue, finalLanguage)
//   const editorForegroundColor = theme.colors['editor.foreground'].toLowerCase()

//   return (
//     <code
//       className={className}
//       style={{
//         paddingTop: paddingVertical,
//         paddingBottom: paddingVertical,
//         paddingLeft: paddingHorizontal,
//         paddingRight: paddingHorizontal,
//         borderRadius: 5,
//         boxShadow: `0 0 0 1px ${theme.colors['panel.border']}70`,
//         backgroundColor: theme.colors['editor.background'],
//         color: theme.colors['editor.foreground'],
//         ...style,
//       }}
//     >
//       {tokens.map((line, lineIndex) => (
//         <Fragment key={lineIndex}>
//           {line.map((token, tokenIndex) => {
//             const isForegroundColor = token.color
//               ? token.color.toLowerCase() === editorForegroundColor
//               : false
//             const isWhitespace = token.content.trim() === ''

//             if (isForegroundColor || isWhitespace) {
//               return token.content
//             }

//             return (
//               <span
//                 key={tokenIndex}
//                 style={{ ...token.fontStyle, color: token.color }}
//               >
//                 {token.content}
//               </span>
//             )
//           })}
//           {lineIndex === tokens.length - 1 ? null : '\n'}
//         </Fragment>
//       ))}
//     </code>
//   )
// }
