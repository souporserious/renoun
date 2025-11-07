import React from 'react'
import { describe, it, expect } from 'vitest'
import { PassThrough } from 'node:stream'
import { renderToPipeableStream } from 'react-dom/server'

import { MDX } from '../MDX.js'
import { CodeBlock } from './CodeBlock.js'

async function renderToStringAsync(element: React.ReactElement) {
  return new Promise<string>((resolve, reject) => {
    const stream = new PassThrough()
    const chunks: Buffer[] = []
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    stream.on('error', reject)
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))

    const { pipe } = renderToPipeableStream(element, {
      onAllReady() {
        pipe(stream)
      },
      onError(error) {
        reject(error)
      },
    })
  })
}

const codeString = `
\`\`\`tsx path="CodeBlock.example.tsx" allowCopy={false}
import { CodeBlock } from 'renoun'

const code = \`
'use client'
import { useState } from 'react'

export function useCounter(initialValue: number = 0) {
  const [count, setCount] = useState(initialValue)

  return { count, increment: () => setCount(count + 1), decrement: () => setCount(count - 1) }
}
\`

export default function Page() {
  return (
    <CodeBlock path="useCounter.ts" shouldFormat>
      {code}
    </CodeBlock>
  )
}
\`\`\`
`

const mdxString = `
# Hello World

<Step>

${codeString}

</Step>
`

describe('MDX CodeBlock SSR', () => {
  it('renders the CodeBlock component', async () => {
    const element = (
      <MDX
        components={{
          CodeBlock,
          Step: ({ children }) => <div>{children}</div>,
        }}
      >
        {mdxString}
      </MDX>
    )
    const html = await renderToStringAsync(element)

    expect(html).toMatchInlineSnapshot(`
      "<style data-precedence="rsl" data-href="lua4gg1 l18t0eui l1tk0l56 l1e6ftoz l1ktm6da l1vo39qk l1ga6j7k rsli lwpzoc4 llpojsz l11dxucz l1boary2">.lua4gg1{grid-row:1 / -1}.l18t0eui{grid-column:1}.l1tk0l56{padding:0.5lh 0.5lh}.l1e6ftoz{margin:0px}.l1ktm6da{border-radius:inherit}.l1vo39qk{padding:0px}.l1ga6j7k{border-radius:5px}.lwpzoc4{gap:0.25em}.llpojsz{padding:0.5lh}.l11dxucz{border:0px}.l1boary2{background-position:bottom left}</style><style data-precedence="rsm" data-href="rsmi"></style><style data-precedence="rsh" data-href="h1swkjl2 h19hdwb7 h1pvkdie hfo5knq hshj6qu hfsbnq8 hn3vp5i h1qrwxp5 h6pmqtl h1hmmtxd hynqly5 h15eot3 h11h57k0 h1ke7mjd hrngqxy h1x54ai9 h1dkuxgf h1orvvbe h1hmlx2i hvfnzw3 huaq9k9 hfoj65y h1y9gwkv h1mfwxmy h1fcq8z h1s5a8ih h98xwn8 h1y5mztz h13mxqlq h1af8v59 h1k2f15v rshi h1cgygmf h1db93z6 h14kb9xb h14b7626 h1dpurtk hlwsj7w hd2p4vg h1bqt6ef h1yb5re4 hf23i21 h9cvyik h1o5vkkg h1ccc064">.h1swkjl2{display:block}.h19hdwb7{width:max-content}.h1pvkdie{min-width:stretch}.hfo5knq{background-color:transparent}.hshj6qu{-webkit-text-size-adjust:none}.hfsbnq8{text-size-adjust:none}.hn3vp5i{position:relative}.h1qrwxp5{white-space:pre}.h6pmqtl{word-wrap:break-word}.h1hmmtxd{display:grid}.hynqly5{grid-auto-rows:max-content}.h15eot3{background-color:inherit}.h11h57k0{overflow-x:scroll}.h1ke7mjd{box-shadow:0 0 0 1px #354553}.hrngqxy{background-color:#09121b}.h1x54ai9{color:#d6deeb}.h1dkuxgf{font-size:0.8em}.h1orvvbe{font-size:inherit}.h1hmlx2i{display:flex}.hvfnzw3{align-items:center}.huaq9k9{box-shadow:inset 0 -1px 0 0 #354553}.hfoj65y{display:inline-flex}.h1y9gwkv{justify-content:center}.h1mfwxmy{width:1lh}.h1fcq8z{height:1lh}.h1s5a8ih{line-height:inherit}.h98xwn8{cursor:pointer}.h1y5mztz{margin-left:auto}.h13mxqlq{color:#5f7e97}.h1af8v59{color:#A492EA}.h1k2f15v{font-style:italic}.h1cgygmf{color:#D9F5DD}.h1db93z6{color:#ECC48D}.h14kb9xb{color:#82AAFF}.h14b7626{color:#7FDBCA}.h1dpurtk{color:#F78C6C}.hlwsj7w{background-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%2C0%206%203'%20enable-background%3D'new%200%200%206%203'%20height%3D'3'%20width%3D'6'%3E%3Cg%20fill%3D'%23f14c4c'%3E%3Cpolygon%20points%3D'5.5%2C0%202.5%2C3%201.1%2C3%204.1%2C0'%2F%3E%3Cpolygon%20points%3D'4%2C0%206%2C2%206%2C0.6%205.4%2C0'%2F%3E%3Cpolygon%20points%3D'0%2C2%201%2C3%202.4%2C3%200%2C0.6'%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E")}.hd2p4vg{background-repeat:repeat-x}.h1bqt6ef{color:#C5E478}.h1yb5re4{color:#f14c4c}.hf23i21{background-color:color-mix(in oklab, currentColor 18%, transparent)}.h9cvyik{padding-left:0.75ch}.h1o5vkkg{white-space:pre-wrap}.h1ccc064{color:#D3423E}</style><style data-precedence="rsl1" data-href="rsl1i"></style><style data-precedence="rsm1" data-href="rsm1i"></style><style data-precedence="rsh1" data-href="h76tt7o hi4nqbe h1u85qaj hr7akya h17d55gr h1aq0e1z">.h76tt7o::-webkit-scrollbar-corner{background-color:transparent}.hi4nqbe::-webkit-scrollbar-thumb{background-color:rgba(0, 0, 0, 0)}.h1u85qaj:hover::-webkit-scrollbar-thumb{background-color:#084d8180}.hr7akya svg{width:0.65lh}.h17d55gr svg{height:0.65lh}.h1aq0e1z svg{color:inherit}</style><h1 id="hello-world"><a href="#hello-world">Hello World</a></h1>
      <div><div class="l1ga6j7k h1ke7mjd hrngqxy h1x54ai9 l1vo39qk"><div class="h1orvvbe h1hmlx2i hvfnzw3 lwpzoc4 huaq9k9 llpojsz"><span class="h1dkuxgf">CodeBlock.example.tsx</span><button title="Copy code to clipboard" class="hfoj65y hvfnzw3 h1y9gwkv h1mfwxmy h1fcq8z h1orvvbe h1s5a8ih l1vo39qk l11dxucz hfo5knq h98xwn8 hr7akya h17d55gr h1aq0e1z h1y5mztz h13mxqlq"><svg viewBox="0 0 24 24" fill="none"><path d="M8 9.56402V19.436C8 20.2998 8.70023 21 9.56402 21L19.436 21C20.2998 21 21 20.2998 21 19.436V9.56402C21 8.70023 20.2998 8 19.436 8H9.56402C8.70023 8 8 8.70023 8 9.56402Z" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path><path d="M7.23913 16L4.56402 16C3.70023 16 3 15.2998 3 14.436V4.56402C3 3.70023 3.70023 3 4.56402 3L14.436 3C15.2998 3 16 3.70023 16 4.56402V7.52174" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg></button></div><pre tabindex="0" class="hshj6qu hfsbnq8 hn3vp5i h1qrwxp5 h6pmqtl h1hmmtxd hynqly5 l1e6ftoz h15eot3 l1ktm6da h11h57k0 h76tt7o hi4nqbe h1u85qaj l1vo39qk"><code class="lua4gg1 h1swkjl2 h19hdwb7 h1pvkdie hfo5knq l18t0eui l1tk0l56"><span class="h1af8v59 h1k2f15v">import<!-- --></span> { <span id="_R_q2lcn_">CodeBlock<!-- --></span> } <span class="h1af8v59 h1k2f15v">from<!-- --></span> <span class="h1cgygmf">&#x27;<!-- --></span><span class="h1db93z6">renoun<!-- --></span><span class="h1cgygmf">&#x27;<!-- --></span>
      <!-- -->
      <span class="h1af8v59">const<!-- --></span> <span id="_R_q6lcn_" class="h14kb9xb h1k2f15v">code<!-- --></span> <span class="h1af8v59">=<!-- --></span> <!-- -->\`<!-- -->
      <span class="h1db93z6 h1k2f15v">&#x27;use client&#x27;<!-- --></span>
      <span class="h1db93z6 h1k2f15v">import { useState } from &#x27;react&#x27;<!-- --></span>
      <!-- -->
      <span class="h1db93z6 h1k2f15v">export function useCounter(initialValue: number = 0) {<!-- --></span>
      <span class="h1db93z6 h1k2f15v">  const [count, setCount] = useState(initialValue)<!-- --></span>
      <!-- -->
      <span class="h1db93z6 h1k2f15v">  return { count, increment: () =&gt; setCount(count + 1), decrement: () =&gt; setCount(count - 1) }<!-- --></span>
      <span class="h1db93z6 h1k2f15v">}<!-- --></span>
      <!-- -->\`<!-- -->
      <!-- -->
      <span class="h1af8v59 h1k2f15v">export<!-- --></span> <span class="h1af8v59 h1k2f15v">default<!-- --></span> <span class="h1af8v59">function<!-- --></span> <span id="_R_1qslcn_" class="h14kb9xb h1k2f15v">Page<!-- --></span><span class="h1cgygmf">()<!-- --></span> {<!-- -->
      <!-- -->  <span class="h1af8v59 h1k2f15v">return<!-- --></span> (<!-- -->
      <!-- -->    <span class="h14b7626">&lt;<!-- --></span><span id="_R_r0lcn_" class="h1dpurtk hlwsj7w hd2p4vg l1boary2">CodeBlock<!-- --></span> <span id="_R_1b0lcn_" class="h1bqt6ef h1k2f15v">path<!-- --></span><span class="h1af8v59">=<!-- --></span><span class="h1cgygmf">&quot;<!-- --></span><span class="h1db93z6">useCounter.ts<!-- --></span><span class="h1cgygmf">&quot;<!-- --></span> <span id="_R_2r0lcn_" class="h1bqt6ef h1k2f15v">shouldFormat<!-- --></span><span class="h14b7626">&gt;<!-- --></span>
      <span class="h1swkjl2 h1yb5re4 hf23i21 h9cvyik h1o5vkkg">&#x27;React&#x27; refers to a UMD global, but the current file is a module. Consider adding an import instead. (2686)<!-- --></span>      <span class="h1ccc064">{<!-- --></span><span id="_R_r2lcn_">code<!-- --></span><span class="h1ccc064">}<!-- --></span>
      <!-- -->    <span class="h14b7626">&lt;/<!-- --></span><span id="_R_r4lcn_" class="h1dpurtk">CodeBlock<!-- --></span><span class="h14b7626">&gt;<!-- --></span>
      <!-- -->  )<!-- -->
      <!-- -->}<!-- --></code></pre></div></div>"
    `)
  })
})
