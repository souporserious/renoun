'use client'
import dynamic from 'next/dynamic'

const Editor = dynamic(() => import('mdxts/editor'), { ssr: false })

export { Editor }
