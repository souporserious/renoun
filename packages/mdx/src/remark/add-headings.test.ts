import { describe, expect, test } from 'vitest'
import { compile, evaluate } from '@mdx-js/mdx'

import addHeadings from './add-headings'

describe('addHeadings', () => {
  test('string heading', async () => {
    const result = await compile(`# Hello, world!`, {
      remarkPlugins: [addHeadings],
      development: true,
    })

    const code = String(result)
    expect(code).toContain('export const headings = [{')
    expect(code).not.toContain('export const Heading')
    expect(code).not.toContain('_missingMdxReference("Heading"')
    expect(String(result)).toMatchInlineSnapshot(`
      "import {Fragment as _Fragment, jsxDEV as _jsxDEV} from "react/jsx-dev-runtime";
      export const headings = [{
        id: "hello-world",
        level: 1,
        children: "Hello, world!",
        text: "Hello, world!"
      }];
      const DefaultHeadingComponent = ({Tag, id, children, ...rest}) => _jsxDEV(Tag, {
        id: id,
        ...rest,
        children: _jsxDEV("a", {
          href: \`#\${id}\`,
          children: children
        }, undefined, false, {
          fileName: "<source.js>"
        }, this)
      }, undefined, false, {
        fileName: "<source.js>"
      }, this);
      function _createMdxContent(props) {
        return _jsxDEV(_Fragment, {
          children: (() => {
            const C = typeof _components !== "undefined" && _components || (props.components || ({})), HeadingComponent = C.Heading || DefaultHeadingComponent;
            return _jsxDEV(HeadingComponent, {
              Tag: C && C.h1 || "h1",
              id: "hello-world",
              children: "Hello, world!"
            }, undefined, false, {
              fileName: "<source.js>"
            }, this);
          })()
        }, undefined, false, {
          fileName: "<source.js>",
          lineNumber: 1,
          columnNumber: 1
        }, this);
      }
      export default function MDXContent(props = {}) {
        const {wrapper: MDXLayout} = props.components || ({});
        return MDXLayout ? _jsxDEV(MDXLayout, {
          ...props,
          children: _jsxDEV(_createMdxContent, {
            ...props
          }, undefined, false, {
            fileName: "<source.js>"
          }, this)
        }, undefined, false, {
          fileName: "<source.js>"
        }, this) : _createMdxContent(props);
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
      const DefaultHeadingComponent = ({Tag, id, children, ...rest}) => _jsx(Tag, {
        id: id,
        ...rest,
        children: _jsx("a", {
          href: \`#\${id}\`,
          children: children
        })
      });
      function _createMdxContent(props) {
        const _components = {
          code: "code",
          ...props.components
        };
        return _jsx(_Fragment, {
          children: (() => {
            const C = typeof _components !== "undefined" && _components || (props.components || ({})), HeadingComponent = C.Heading || DefaultHeadingComponent;
            return _jsx(HeadingComponent, {
              Tag: C && C.h1 || "h1",
              id: "hello-world",
              children: _jsxs(_Fragment, {
                children: ["Hello, ", _jsx(_components.code, {
                  children: "world"
                }), "!"]
              })
            });
          })()
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
      const DefaultHeadingComponent = ({Tag, id, children, ...rest}) => _jsx(Tag, {
        id: id,
        ...rest,
        children: _jsx("a", {
          href: \`#\${id}\`,
          children: children
        })
      });
      function _createMdxContent(props) {
        const _components = {
          img: "img",
          ...props.components
        };
        return _jsx(_Fragment, {
          children: (() => {
            const C = typeof _components !== "undefined" && _components || (props.components || ({})), HeadingComponent = C.Heading || DefaultHeadingComponent;
            return _jsx(HeadingComponent, {
              Tag: C && C.h1 || "h1",
              id: "hello-world",
              children: _jsx(_components.img, {
                src: "https://example.com/image.png",
                alt: "Hello, world!"
              })
            });
          })()
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

  test('attaches summaries for each heading when possible', async () => {
    const mdxSource = `# Search Plugin

Before diving in, this introduction paragraph provides some immediate context about search indexing in renoun. It explains how the plugin works, what kind of data is collected, and why concise excerpts improve the quality of the search results across the documentation site.

## Getting started

Search indexing begins by scanning your document headings and collecting the first meaningful block after each section. This typically results in a concise paragraph that remains under the target length while still covering the topic with enough detail for a helpful preview.

### Choosing excerpts

- Start with the first descriptive paragraph when possible
- Prefer rich paragraphs over dense code samples
- Use short lists if the section opens with bullet points
`

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

    expect(mdxModule.headings).toMatchInlineSnapshot(`
      [
        {
          "children": "Search Plugin",
          "id": "search-plugin",
          "level": 1,
          "summary": "Before diving in, this introduction paragraph provides some immediate context about search indexing in renoun. It explains how the plugin works, what kind of data is collected, and why concise excerpts improve the quality of the search results across the documentation site.",
          "text": "Search Plugin",
        },
        {
          "children": "Getting started",
          "id": "getting-started",
          "level": 2,
          "summary": "Search indexing begins by scanning your document headings and collecting the first meaningful block after each section. This typically results in a concise paragraph that remains under the target length while still covering the topic with enough detail for a helpful preview.",
          "text": "Getting started",
        },
        {
          "children": "Choosing excerpts",
          "id": "choosing-excerpts",
          "level": 3,
          "summary": "Start with the first descriptive paragraph when possible • Prefer rich paragraphs over dense code samples",
          "text": "Choosing excerpts",
        },
      ]
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

  test('Tag resolves through props.components.h1 with fallback to "h1"', async () => {
    const result = await compile(`# Hello`, {
      remarkPlugins: [addHeadings],
    })
    const code = String(result)
    // Ensure Tag is selected via components map first, then intrinsic element
    expect(code).toContain('Tag: C && C.h1 || "h1"')
  })

  test('uses provided Heading component and passes expected props (snapshot)', async () => {
    const mdxSource = `# Hello`
    const calls: Array<any> = []
    function HeadingOverride() {
      return null
    }
    const jsxStub = (type: any, props: any) => {
      calls.push({ type, props })
      return null
    }
    const mdxModule = await evaluate(mdxSource, {
      remarkPlugins: [addHeadings],
      development: false,
      Fragment: Symbol.for('react.fragment'),
      jsx: jsxStub,
      jsxs: jsxStub,
    })

    mdxModule.default({ components: { Heading: HeadingOverride } })

    const invocation = calls.find(
      (component) => component.type === HeadingOverride
    )
    expect(invocation?.props).toMatchInlineSnapshot(`
      {
        "Tag": "h1",
        "children": "Hello",
        "id": "hello",
      }
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
    expect(headings[0].summary).toBeUndefined()
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
