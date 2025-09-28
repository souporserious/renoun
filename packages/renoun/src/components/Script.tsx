import React from 'react'

/** Determines how the script is included in the HTML */
type ScriptVariants =
  /** Renders the script inline blocking HTML parsing until the script loads and executes. */
  | 'block'
  /** Adds `type="module"` attribute to defer loading the script until after HTML parsing. */
  | 'defer'
  /** Loads the script in the head of the document as soon as possible. */
  | 'hoist'

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
  const { variant = 'block', nonce, children, ...args } = props
  const module = await children
  const fn = module?.default

  if (typeof fn !== 'function') {
    throw new TypeError('[renoun] Script default export must be a function')
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
      type={variant === 'defer' ? 'module' : undefined}
      children={code.replace(/<\/script/gi, '<\\/script>')}
    />
  )
}
