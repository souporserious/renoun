// @ts-expect-error
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
import React, { use, useState } from 'react'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { createStarryNight } from '@wooorm/starry-night'
import sourceTsx from './grammars/source.tsx'

// import sourceCss from '@wooorm/starry-night/lang/source.css.js'
// import sourceDiff from '@wooorm/starry-night/lang/source.diff.js'
// import sourceJs from '@wooorm/starry-night/lang/source.js.js'
// import sourceJson from '@wooorm/starry-night/lang/source.json.js'
// import sourceToml from '@wooorm/starry-night/lang/source.toml.js'
// import sourceTs from '@wooorm/starry-night/lang/source.ts.js'
// import sourceTsx from '@wooorm/starry-night/lang/source.tsx'
// import sourceYaml from '@wooorm/starry-night/lang/source.yaml.js'
// import textHtmlBasic from '@wooorm/starry-night/lang/text.html.basic.js'
// import textXmlSvg from '@wooorm/starry-night/lang/text.xml.svg.js'

// const grammars = [
// sourceCss,
// sourceDiff,
// sourceJs,
// sourceJson,
// sourceToml,
// sourceTs,
// sourceTsx,
// sourceYaml,
// textHtmlBasic,
// textXmlSvg,
// ]

const starryNightPromise = createStarryNight([sourceTsx])

/** Code editor with syntax highlighting. */
export function Editor({
  language = 'typescript',
  scope = 'source.tsx',
  defaultValue,
  value,
  onChange,
}: {
  language?: string
  scope?: string
  defaultValue?: string
  value: string
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
}) {
  const [stateValue, setStateValue] = useState(defaultValue)
  const starryNight = use(starryNightPromise)
  const resolvedValue = value ?? stateValue
  const sharedStyle = {
    gridArea: '1 / 1',
    padding: 0,
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    fontFamily: 'monospace',
    fontSize: 14,
    tabSize: 4,
    letterSpacing: 'normal',
    lineHeight: 'calc(1 * (1em + 1ex))',
  } satisfies React.CSSProperties
  return (
    <div style={{ display: 'grid', width: '100%' }}>
      <div style={sharedStyle}>
        {toJsxRuntime(starryNight.highlight(resolvedValue, scope), {
          jsx,
          jsxs,
          Fragment,
        })}
        {/\n[ \t]*$/.test(resolvedValue) ? <br /> : undefined}
      </div>
      <textarea
        spellCheck="false"
        className="write"
        value={resolvedValue}
        onChange={
          defaultValue
            ? (event: React.ChangeEvent<HTMLTextAreaElement>) => {
                setStateValue(event.target.value)
                onChange?.(event)
              }
            : onChange
        }
        rows={resolvedValue.split('\n').length + 1}
        style={{
          ...sharedStyle,
          backgroundColor: 'transparent',
          color: 'transparent',
          caretColor: '#79c0ff',
          resize: 'none',
        }}
      />
    </div>
  )
}
