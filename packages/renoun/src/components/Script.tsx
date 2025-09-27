import React from 'react'

/** Determines how the script is included in the HTML */
type ScriptVariants =
  /** Renders a script tag with the `defer` attribute. */
  | 'defer'
  /** Renders a script tag with an async data URL to load the script as soon as possible. */
  | 'hoist'
  /** Renders a script tag with the script content inline. */
  | 'inline'

interface ScriptProps {
  /** The variant of script to render. Defaults to `defer`. */
  variant?: ScriptVariants

  /** A nonce for Content Security Policy */
  nonce?: string

  /**
   * A promise that resolves to a module with a default export containing the
   * script content. The script should be contained entirely within the default
   * export. Only types can be external to the default export.
   */
  children: Promise<any>
}

/** Renders a script tag with the provided script content. */
export async function Script(props: ScriptProps & Record<string, any>) {
  const { variant = 'defer', nonce, children, ...args } = props
  const module = await children
  const fn = module?.default
  if (typeof fn !== 'function') {
    throw new TypeError('Script: default export must be a function')
  }

  const fnSource = Function.prototype.toString.call(fn).trim()
  const argLiteral = args === undefined ? 'undefined' : JSON.stringify(args)
  const code = `void (${fnSource})(${argLiteral});\n`

  if (variant === 'hoist') {
    const base64 = Buffer.from(code, 'utf8').toString('base64')
    return (
      <script
        nonce={nonce}
        async
        src={`data:text/javascript;base64,${base64}`}
      />
    )
  }

  return (
    <script
      nonce={nonce}
      defer={variant === 'defer'}
      children={code.replace(/<\/script/gi, '<\\/script>')}
    />
  )
}
