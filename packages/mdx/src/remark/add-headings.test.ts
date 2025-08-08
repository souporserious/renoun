import { describe, expect, test } from 'vitest'
import { compile, evaluate } from '@mdx-js/mdx'

import addHeadings from './add-headings'

describe('addHeadings', () => {
  test('string heading', async () => {
    const result = await compile(`# Hello, world!`, {
      remarkPlugins: [addHeadings],
    })

    expect(String(result)).toMatchInlineSnapshot(`
      "import {jsx as _jsx} from "react/jsx-runtime";
      export const headings = [{
        id: "hello-world",
        level: 1,
        children: "Hello, world!",
        text: "Hello, world!"
      }];
      function _createMdxContent(props) {
        const _components = {
          h1: "h1",
          ...props.components
        };
        return _jsx(_components.h1, {
          id: "hello-world",
          children: "Hello, world!"
        });
      }
      export default function MDXContent(props = {}) {
        const {wrapper: MDXLayout} = props.components || ({});
        return MDXLayout ? _jsx(MDXLayout, {
          ...props,
          children: _jsx(_createMdxContent, {
            ...props
          })
        }) : _createMdxContent(props);
      }
      "
    `)
  })

  test('code heading', async () => {
    const result = await compile(`# Hello, \`world\`!`, {
      remarkPlugins: [addHeadings],
    })

    expect(String(result)).toMatchInlineSnapshot(`
      "import {Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs} from "react/jsx-runtime";
      export const headings = [{
        id: "hello-world",
        level: 1,
        children: _jsxs(_Fragment, {
          children: ["Hello, ", _jsx("code", {
            children: "world"
          }), "!"]
        }),
        text: "Hello, world!"
      }];
      function _createMdxContent(props) {
        const _components = {
          code: "code",
          h1: "h1",
          ...props.components
        };
        return _jsxs(_components.h1, {
          id: "hello-world",
          children: ["Hello, ", _jsx(_components.code, {
            children: "world"
          }), "!"]
        });
      }
      export default function MDXContent(props = {}) {
        const {wrapper: MDXLayout} = props.components || ({});
        return MDXLayout ? _jsx(MDXLayout, {
          ...props,
          children: _jsx(_createMdxContent, {
            ...props
          })
        }) : _createMdxContent(props);
      }
      "
    `)
  })

  test('link heading', async () => {
    const result = await compile(`# [Hello, world!](https://example.com)`, {
      remarkPlugins: [addHeadings],
    })

    expect(String(result)).toMatchInlineSnapshot(`
      "import {jsx as _jsx} from "react/jsx-runtime";
      export const headings = [{
        id: "hello-world",
        level: 1,
        children: _jsx("a", {
          href: "https://example.com",
          children: "Hello, world!"
        }),
        text: "Hello, world!"
      }];
      function _createMdxContent(props) {
        const _components = {
          a: "a",
          h1: "h1",
          ...props.components
        };
        return _jsx(_components.h1, {
          id: "hello-world",
          children: _jsx(_components.a, {
            href: "https://example.com",
            children: "Hello, world!"
          })
        });
      }
      export default function MDXContent(props = {}) {
        const {wrapper: MDXLayout} = props.components || ({});
        return MDXLayout ? _jsx(MDXLayout, {
          ...props,
          children: _jsx(_createMdxContent, {
            ...props
          })
        }) : _createMdxContent(props);
      }
      "
    `)
  })

  test('image heading', async () => {
    const result = await compile(
      `# ![Hello, world!](https://example.com/image.png)`,
      {
        remarkPlugins: [addHeadings],
      }
    )

    expect(String(result)).toMatchInlineSnapshot(`
      "import {jsx as _jsx} from "react/jsx-runtime";
      export const headings = [{
        id: "hello-world",
        level: 1,
        children: _jsx("img", {
          src: "https://example.com/image.png",
          alt: "Hello, world!"
        }),
        text: "Hello, world!"
      }];
      function _createMdxContent(props) {
        const _components = {
          h1: "h1",
          img: "img",
          ...props.components
        };
        return _jsx(_components.h1, {
          id: "hello-world",
          children: _jsx(_components.img, {
            src: "https://example.com/image.png",
            alt: "Hello, world!"
          })
        });
      }
      export default function MDXContent(props = {}) {
        const {wrapper: MDXLayout} = props.components || ({});
        return MDXLayout ? _jsx(MDXLayout, {
          ...props,
          children: _jsx(_createMdxContent, {
            ...props
          })
        }) : _createMdxContent(props);
      }
      "
    `)
  })

  test('wraps headings with getHeadings when exported', async () => {
    const mdxSource = `
export function getHeadings(headings) {
  return [
    ...headings,
    { id: 'extra', level: 2, text: 'Extra', children: 'Extra' }
  ]
}

# Hello
`

    // Minimal jsxRuntime stub to evaluate without React in tests
    const jsxRuntime = {
      Fragment: Symbol.for('react.fragment'),
      jsx: () => null,
      jsxs: () => null,
    }

    const result = await evaluate(mdxSource, {
      remarkPlugins: [[addHeadings, { allowGetHeadings: true }]],
      development: false,
      ...jsxRuntime,
    })

    const headings = (result as any).headings as Array<any>

    // Ensure the compiled module exports headings that are the result of calling getHeadings([...])
    expect(Array.isArray(headings)).toBe(true)
    expect(headings.length).toBe(2)
    expect(headings[0].id).toBe('hello')
    expect(headings[1].id).toBe('extra')
  })

  test('runtime validation that getHeadings must return an array', async () => {
    const mdxSource = `
export function getHeadings(headings) {
  return { pwnd: true }
}

# Hello
`

    const jsxRuntime = {
      Fragment: Symbol.for('react.fragment'),
      jsx: () => null,
      jsxs: () => null,
    }

    await expect(
      evaluate(mdxSource, {
        remarkPlugins: [[addHeadings, { allowGetHeadings: true }]],
        development: false,
        ...jsxRuntime,
      })
    ).rejects.toThrow(/getHeadings\(headings\) must return an array/)
  })

  test('throws when exporting headings directly with guidance', async () => {
    const mdxSource = `
export const headings = []

# Hello
`

    const vfile = await compile(mdxSource, {
      remarkPlugins: [[addHeadings, { allowGetHeadings: true }]],
    })
    const messages = (vfile as any).messages as Array<any>
    const hasFatal = messages.some(
      (message) =>
        message.fatal &&
        /Exporting \"headings\" directly is not supported/i.test(message.reason)
    )
    expect(hasFatal).toBe(true)
  })
})
