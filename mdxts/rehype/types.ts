import * as shiki from 'shiki'

export type Headings = {
  id: any
  text: string
  depth: number
}[]

export type CodeBlocks = {
  text: string
  heading: Headings[number] | null
  language: shiki.Lang
  tokens: shiki.IThemedToken[][]
}[]

export type FileData = {
  path: string
  headings: Headings
  codeBlocks: CodeBlocks
}
