import React from 'react'
import { Callout, CodeBlock } from 'renoun/components'

export function Note() {
  return (
    <Callout variant="note">
      Highlight information the reader should take into account.
    </Callout>
  )
}

export function Tip() {
  return (
    <Callout variant="tip">
      Optional information to help the reader be more successful.
    </Callout>
  )
}

export function Important() {
  return (
    <Callout variant="important">
      Crucial information necessary for the reader to succeed.
    </Callout>
  )
}

export function Warning() {
  return (
    <Callout variant="warning">
      Critical content demanding immediate attention.
    </Callout>
  )
}

export function Caution() {
  return (
    <Callout variant="caution">
      Negative potential consequences of an action.
    </Callout>
  )
}

export function NestedCodeBlock() {
  return (
    <Callout>
      <p>
        Nest code blocks in alerts to provide more context. Below is an example
        of using React hooks to manage a counter state:
      </p>
      <CodeBlock value={counterExample} language="jsx" />
    </Callout>
  )
}

const counterExample = `
import { useState } from 'react'

function Counter() {
  const [count, setCount] = useState(0)

  return (
    <div>
      <p>Current Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  )
}`

const CalloutWithOverrides = Callout.variants({
  important: {
    icon: '🔮',
    style: {
      backgroundColor: 'var(--color-background-important)',
      borderLeftColor: 'var(--color-border-important)',
    },
  },
})

export function VariantOverrides() {
  return (
    <CalloutWithOverrides variant="important">
      Override the default styles of a callout variant.
    </CalloutWithOverrides>
  )
}
