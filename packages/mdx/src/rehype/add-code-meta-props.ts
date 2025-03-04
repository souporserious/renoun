import type { Parent } from 'unist'
import type { Element, Properties } from 'hast'
import { toString } from 'hast-util-to-string'
import { visit, SKIP } from 'unist-util-visit'

interface CodeMetaElement extends Element {
  data?: {
    meta?: string
  }
  properties: Properties & {
    className?: string | string[]
    filename?: string
    language?: string
  }
}

/** Parses `CodeBlock` and `CodeInline` props and adds them to `pre` and `code` element properties respectively. */
export function addCodeMetaProps() {
  return async (tree: Parent) => {
    visit(tree, 'element', (element: CodeMetaElement) => {
      if (element.tagName === 'pre') {
        const codeNode = element.children[0] as CodeMetaElement

        // Map meta string to props
        const meta = codeNode.data?.meta
        const props: Record<string, any> = {}

        meta?.split(' ').forEach((prop) => {
          const indexOfFirstEquals = prop.indexOf('=')
          if (indexOfFirstEquals === -1) {
            // Coerce boolean props to true if they don't have an explicit value
            props[prop] = true
          } else {
            const key = prop.substring(0, indexOfFirstEquals)
            const value = prop.substring(indexOfFirstEquals + 1)
            // Strip surrounding quotes if present
            props[key] = value.replace(/^["']|["']$/g, '')
          }
        })

        // Add props to code element
        Object.assign(element.properties, props)

        if (
          codeNode &&
          codeNode.type === 'element' &&
          codeNode.tagName === 'code'
        ) {
          const codeString = toString(codeNode)
          element.properties.value = codeString

          // get class name from code element
          const className = codeNode.properties.className as string
          const metadata = getClassNameMetadata(className || '')

          // Add filename and language as a props if they don't already exist
          if (metadata) {
            if (!element.properties.filename && metadata.filename) {
              element.properties.filename = metadata.filename
            }

            if (!element.properties.language) {
              element.properties.language = metadata.language
            }
          }
        }

        return SKIP
      } else if (element.tagName === 'code') {
        const codeString = toString(element)
        const firstSpaceIndex = codeString.indexOf(' ')

        if (firstSpaceIndex > -1) {
          const language = codeString.substring(0, firstSpaceIndex)
          const isValidLanguage = languages.includes(language)

          if (isValidLanguage) {
            // Add the language as a prop for syntax highlighting
            element.properties.language = language

            // Replace the element's content with just the code
            element.children = [
              {
                type: 'text',
                value: codeString.substring(firstSpaceIndex + 1),
              },
            ]
          }
        }
      }
    })
  }
}

const languageKey = 'language-'
const languageLength = languageKey.length

/** Parses file metadata from a remark code block class name. */
function getClassNameMetadata(className: string | string[]) {
  const classNames = Array.isArray(className) ? className : className.split(' ')
  const filenameOrLanguage = classNames
    .find((name) => name.startsWith(languageKey))
    ?.slice(languageLength)

  if (!filenameOrLanguage) {
    return null
  }

  const extension = filenameOrLanguage.split('.').pop() ?? filenameOrLanguage

  return {
    filename: filenameOrLanguage?.includes('.') ? filenameOrLanguage : null,
    language: extension,
  } as {
    filename: string | null
    language: string
  }
}

const languages = [
  'abap',
  'actionscript-3',
  'ada',
  'angular-html',
  'angular-ts',
  'apache',
  'apex',
  'apl',
  'applescript',
  'ara',
  'asciidoc',
  'adoc',
  'asm',
  'astro',
  'awk',
  'ballerina',
  'bat',
  'batch',
  'beancount',
  'berry',
  'be',
  'bibtex',
  'bicep',
  'blade',
  'bsl',
  '1c',
  'c',
  'cadence',
  'cdc',
  'cairo',
  'clarity',
  'clojure',
  'clj',
  'cmake',
  'cobol',
  'codeowners',
  'codeql',
  'ql',
  'coffee',
  'coffeescript',
  'common-lisp',
  'lisp',
  'coq',
  'cpp',
  'c++',
  'crystal',
  'csharp',
  'c#',
  'cs',
  'css',
  'csv',
  'cue',
  'cypher',
  'cql',
  'd',
  'dart',
  'dax',
  'desktop',
  'diff',
  'docker',
  'dockerfile',
  'dotenv',
  'dream-maker',
  'edge',
  'elixir',
  'elm',
  'emacs-lisp',
  'elisp',
  'erb',
  'erlang',
  'erl',
  'fennel',
  'fish',
  'fluent',
  'ftl',
  'fortran-fixed-form',
  'f',
  'for',
  'f77',
  'fortran-free-form',
  'f90',
  'f95',
  'f03',
  'f08',
  'f18',
  'fsharp',
  'f#',
  'fs',
  'gdresource',
  'gdscript',
  'gdshader',
  'genie',
  'gherkin',
  'git-commit',
  'git-rebase',
  'gleam',
  'glimmer-js',
  'gjs',
  'glimmer-ts',
  'gts',
  'glsl',
  'gnuplot',
  'go',
  'graphql',
  'gql',
  'groovy',
  'hack',
  'haml',
  'handlebars',
  'hbs',
  'haskell',
  'hs',
  'haxe',
  'hcl',
  'hjson',
  'hlsl',
  'html',
  'html-derivative',
  'http',
  'hxml',
  'hy',
  'imba',
  'ini',
  'properties',
  'java',
  'javascript',
  'js',
  'jinja',
  'jison',
  'json',
  'json5',
  'jsonc',
  'jsonl',
  'jsonnet',
  'jssm',
  'fsl',
  'jsx',
  'julia',
  'jl',
  'kotlin',
  'kt',
  'kts',
  'kusto',
  'kql',
  'latex',
  'lean',
  'lean4',
  'less',
  'liquid',
  'log',
  'logo',
  'lua',
  'luau',
  'make',
  'makefile',
  'markdown',
  'md',
  'marko',
  'matlab',
  'mdc',
  'mdx',
  'mermaid',
  'mmd',
  'mipsasm',
  'mips',
  'mojo',
  'move',
  'narrat',
  'nar',
  'nextflow',
  'nf',
  'nginx',
  'nim',
  'nix',
  'nushell',
  'nu',
  'objective-c',
  'objc',
  'objective-cpp',
  'ocaml',
  'pascal',
  'perl',
  'php',
  'plsql',
  'po',
  'pot',
  'potx',
  'polar',
  'postcss',
  'powerquery',
  'powershell',
  'ps',
  'ps1',
  'prisma',
  'prolog',
  'proto',
  'protobuf',
  'pug',
  'jade',
  'puppet',
  'purescript',
  'python',
  'py',
  'qml',
  'qmldir',
  'qss',
  'r',
  'racket',
  'raku',
  'perl6',
  'razor',
  'reg',
  'regexp',
  'regex',
  'rel',
  'riscv',
  'rst',
  'ruby',
  'rb',
  'rust',
  'rs',
  'sas',
  'sass',
  'scala',
  'scheme',
  'scss',
  'sdbl',
  '1c-query',
  'shaderlab',
  'shader',
  'shellscript',
  'bash',
  'sh',
  'shell',
  'zsh',
  'shellsession',
  'console',
  'smalltalk',
  'solidity',
  'soy',
  'closure-templates',
  'sparql',
  'splunk',
  'spl',
  'sql',
  'ssh-config',
  'stata',
  'stylus',
  'styl',
  'svelte',
  'swift',
  'system-verilog',
  'systemd',
  'talonscript',
  'talon',
  'tasl',
  'tcl',
  'templ',
  'terraform',
  'tf',
  'tfvars',
  'tex',
  'toml',
  'ts-tags',
  'lit',
  'tsv',
  'tsx',
  'turtle',
  'twig',
  'typescript',
  'ts',
  'typespec',
  'tsp',
  'typst',
  'typ',
  'v',
  'vala',
  'vb',
  'cmd',
  'verilog',
  'vhdl',
  'viml',
  'vim',
  'vimscript',
  'vue',
  'vue-html',
  'vyper',
  'vy',
  'wasm',
  'wenyan',
  '文言',
  'wgsl',
  'wikitext',
  'mediawiki',
  'wiki',
  'wolfram',
  'wl',
  'xml',
  'xsl',
  'yaml',
  'yml',
  'zenscript',
  'zig',
]
