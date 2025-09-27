import React from 'react'

/** Determines how the script is included in the HTML */
type ScriptVariants =
  /** Renders a script tag with blocking script content inline. */
  | 'blocking'
  /** Renders a script tag with the `type="module"` attribute to defer loading until after HTML parsing. */
  | 'deferred'
  /** Renders a script tag with an async loaded in the head as soon as possible. */
  | 'hoisted'

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
  const { variant = 'deferred', nonce, children, ...args } = props
  const module = await children
  const fn = module?.default

  if (typeof fn !== 'function') {
    throw new TypeError('[renoun] Script default export must be a function')
  }

  const fnSource = Function.prototype.toString.call(fn).trim()
  const argLiteral = args === undefined ? 'undefined' : JSON.stringify(args)
  const code = `void (${fnSource})(${argLiteral});\n`

  if (variant === 'hoisted') {
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
      type={variant === 'deferred' ? 'module' : undefined}
      children={code.replace(/<\/script/gi, '<\\/script>')}
    />
  )
}
