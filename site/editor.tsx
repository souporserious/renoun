'use client'
import dynamic from 'next/dynamic'

const Editor = dynamic(
  () => import('mdxts/editor').then((module) => module.Editor),
  { ssr: false }
)

export { Editor }
