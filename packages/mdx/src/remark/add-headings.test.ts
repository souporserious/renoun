import { describe, expect, test } from 'vitest'
import { compile, evaluate } from '@mdx-js/mdx'

import addHeadings from './add-headings'

describe('addHeadings', () => {
  test('string heading', async () => {
    const result = await compile(`# Hello, world!`, {
      remarkPlugins: [addHeadings],
    })

    const code = String(result)
    expect(code).toContain('export const headings = [{')
    expect(code).not.toContain('export const Heading')
    expect(code).not.toContain('_missingMdxReference("Heading"')
    expect(String(result)).toMatchInlineSnapshot(`
      "import {Fragment as _Fragment, jsx as _jsx} from "react/jsx-runtime";
      export const headings = [{
        id: "hello-world",
        level: 1,
        children: "Hello, world!",
        text: "Hello, world!"
      }];
      function _createMdxContent(props) {
        const _components = {
          a: "a",
          ...props.components
        };
        return _jsx(_Fragment, {
          children: _jsx(_components.Heading || (({Tag, id, children, ...rest}) => _jsx(Tag, {
            id: id,
            ...rest,
            children: _jsx(_components.a, {
              href: \`#\${id}\`,
              children: children
            })
          })), {
            Tag: _components.h1 || "h1",
            id: "hello-world",
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

  test('code heading', async () => {
    const result = await compile(`# Hello, \`world\`!`, {
      remarkPlugins: [addHeadings],
    })

    const code = String(result)
    expect(code).toContain('export const headings = [{')
    expect(code).not.toContain('export const Heading')
    expect(code).toContain('_components.code')
    expect(code).not.toContain('_missingMdxReference("Heading"')
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
          a: "a",
          code: "code",
          ...props.components
        };
        return _jsx(_Fragment, {
          children: _jsx(_components.Heading || (({Tag, id, children, ...rest}) => _jsx(Tag, {
            id: id,
            ...rest,
            children: _jsx(_components.a, {
              href: \`#\${id}\`,
              children: children
            })
          })), {
            Tag: _components.h1 || "h1",
            id: "hello-world",
            children: _jsxs(_Fragment, {
              children: ["Hello, ", _jsx(_components.code, {
                children: "world"
              }), "!"]
            })
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

  test('link heading throws error', async () => {
    const result = await compile(`# [Hello, world!](https://example.com)`, {
      remarkPlugins: [addHeadings],
    })
    const hasError = result.messages.some((message) =>
      /Links inside headings are not supported/i.test(message.reason)
    )
    expect(hasError).toBe(true)
  })

  test('image heading', async () => {
    const result = await compile(
      `# ![Hello, world!](https://example.com/image.png)`,
      { remarkPlugins: [addHeadings] }
    )

    const code = String(result)
    expect(code).toContain('export const headings = [{')
    expect(code).not.toContain('export const Heading')
    expect(code).toContain('_components.img')
    expect(code).not.toContain('_missingMdxReference("Heading"')
    expect(String(result)).toMatchInlineSnapshot(`
      "import {Fragment as _Fragment, jsx as _jsx} from "react/jsx-runtime";
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
          a: "a",
          img: "img",
          ...props.components
        };
        return _jsx(_Fragment, {
          children: _jsx(_components.Heading || (({Tag, id, children, ...rest}) => _jsx(Tag, {
            id: id,
            ...rest,
            children: _jsx(_components.a, {
              href: \`#\${id}\`,
              children: children
            })
          })), {
            Tag: _components.h1 || "h1",
            id: "hello-world",
            children: _jsx(_components.img, {
              src: "https://example.com/image.png",
              alt: "Hello, world!"
            })
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

  test('Heading can be overridden via MDX components provider', async () => {
    const mdxSource = `# Hello`
    const jsxRuntime = {
      Fragment: Symbol.for('react.fragment'),
      jsx: () => null,
      jsxs: () => null,
    }
    const mdxModule = await evaluate(mdxSource, {
      remarkPlugins: [addHeadings],
      development: false,
      ...jsxRuntime,
    })

    // Should render with default without error
    expect(() => (mdxModule as any).default({})).not.toThrow()

    // Should also render with an override without error
    const override = () => 'OVERRIDDEN'
    expect(() =>
      (mdxModule as any).default({ components: { Heading: override } })
    ).not.toThrow()
  })

  test('Tag resolves through _components.h1 with fallback to "h1"', async () => {
    const result = await compile(`# Hello`, {
      remarkPlugins: [addHeadings],
    })
    const code = String(result)
    // Ensure Tag is selected via components map first, then intrinsic element
    expect(code).toContain('_components.h1 || "h1"')
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
