// import { Code } from '@mdxts/code'
// import { Editor } from '@mdxts/editor'
import { Editor } from './Editor'
// import { Live } from '@mdxts/live'
// import dynamic from 'next/dynamic'

// const Editor = dynamic(async () => (await import('@mdxts/editor')).Editor, {
//   ssr: false,
// })

const defaultValue = `
/**
 * Say hello.
 *
 * @example
 * <Hello name="Penny" />
 */
function Hello({ name }: { name: string }) {
  return <div>Hello, {name}</div>
}
`.trim()

export default function Page() {
  return (
    <>
      {/* <Code>{defaultValue}</Code> */}
      <Editor defaultValue={defaultValue} />
      {/* <Live code={defaultValue} /> */}
    </>
  )
}
