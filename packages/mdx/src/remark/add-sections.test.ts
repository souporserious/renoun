import { describe, expect, test } from 'vitest'
import { compile, evaluate } from '@mdx-js/mdx'

import addSections from './add-sections'

describe('addSections', () => {
  test('string heading', async () => {
    const result = await compile(`# Hello, world!`, {
      remarkPlugins: [addSections],
      development: true,
    })

    const code = String(result)
    expect(code).toContain('export const sections = [{')
    expect(code).not.toContain('export const Heading')
    expect(code).not.toContain('_missingMdxReference("Heading"')
    expect(String(result)).toMatchInlineSnapshot(`
      "import {Fragment as _Fragment, jsxDEV as _jsxDEV} from "react/jsx-dev-runtime";
      export const sections = [{
        id: "hello-world",
        title: "Hello, world!",
        depth: 1,
        jsx: "Hello, world!"
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
            const C = typeof _components !== "undefined" && _components || (props.components || ({})), HeadingComponent = C.Heading || DefaultHeadingComponent, SectionComponent = C && C.Section || _Fragment;
            return _jsxDEV(SectionComponent, {
              id: "hello-world",
              depth: 1,
              title: "Hello, world!",
              children: _jsxDEV(HeadingComponent, {
                Tag: C && C.h1 || "h1",
                id: "hello-world",
                children: "Hello, world!"
              }, undefined, false, {
                fileName: "<source.js>"
              }, this)
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
      remarkPlugins: [addSections],
    })

    const code = String(result)
    expect(code).toContain('export const sections = [{')
    expect(code).not.toContain('export const Heading')
    expect(code).toContain('_components.code')
    expect(code).not.toContain('_missingMdxReference("Heading"')
    expect(String(result)).toMatchInlineSnapshot(`
      "import {Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs} from "react/jsx-runtime";
      export const sections = [{
        id: "hello-world",
        title: "Hello, world!",
        depth: 1,
        jsx: _jsxs(_Fragment, {
          children: ["Hello, ", _jsx("code", {
            children: "world"
          }), "!"]
        })
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
            const C = typeof _components !== "undefined" && _components || (props.components || ({})), HeadingComponent = C.Heading || DefaultHeadingComponent, SectionComponent = C && C.Section || _Fragment;
            return _jsx(SectionComponent, {
              id: "hello-world",
              depth: 1,
              title: "Hello, world!",
              children: _jsx(HeadingComponent, {
                Tag: C && C.h1 || "h1",
                id: "hello-world",
                children: _jsxs(_Fragment, {
                  children: ["Hello, ", _jsx(_components.code, {
                    children: "world"
                  }), "!"]
                })
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
      remarkPlugins: [addSections],
    })
    const hasError = result.messages.some((message) =>
      /Links inside headings are not supported/i.test(message.reason)
    )
    expect(hasError).toBe(true)
  })

  test('image heading', async () => {
    const result = await compile(
      `# ![Hello, world!](https://example.com/image.png)`,
      { remarkPlugins: [addSections] }
    )

    const code = String(result)
    expect(code).toContain('export const sections = [{')
    expect(code).not.toContain('export const Heading')
    expect(code).toContain('_components.img')
    expect(code).not.toContain('_missingMdxReference("Heading"')
    expect(String(result)).toMatchInlineSnapshot(`
      "import {Fragment as _Fragment, jsx as _jsx} from "react/jsx-runtime";
      export const sections = [{
        id: "hello-world",
        title: "Hello, world!",
        depth: 1,
        jsx: _jsx("img", {
          src: "https://example.com/image.png",
          alt: "Hello, world!"
        })
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
            const C = typeof _components !== "undefined" && _components || (props.components || ({})), HeadingComponent = C.Heading || DefaultHeadingComponent, SectionComponent = C && C.Section || _Fragment;
            return _jsx(SectionComponent, {
              id: "hello-world",
              depth: 1,
              title: "Hello, world!",
              children: _jsx(HeadingComponent, {
                Tag: C && C.h1 || "h1",
                id: "hello-world",
                children: _jsx(_components.img, {
                  src: "https://example.com/image.png",
                  alt: "Hello, world!"
                })
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
      remarkPlugins: [addSections],
      development: false,
      ...jsxRuntime,
    })

    expect(mdxModule.sections).toMatchInlineSnapshot(`
      [
        {
          "children": [
            {
              "children": [
                {
                  "depth": 3,
                  "id": "choosing-excerpts",
                  "jsx": "Choosing excerpts",
                  "summary": "Start with the first descriptive paragraph when possible • Prefer rich paragraphs over dense code samples",
                  "title": "Choosing excerpts",
                },
              ],
              "depth": 2,
              "id": "getting-started",
              "jsx": "Getting started",
              "summary": "Search indexing begins by scanning your document headings and collecting the first meaningful block after each section. This typically results in a concise paragraph that remains under the target length while still covering the topic with enough detail for a helpful preview.",
              "title": "Getting started",
            },
          ],
          "depth": 1,
          "id": "search-plugin",
          "jsx": "Search Plugin",
          "summary": "Before diving in, this introduction paragraph provides some immediate context about search indexing in renoun. It explains how the plugin works, what kind of data is collected, and why concise excerpts improve the quality of the search results across the documentation site.",
          "title": "Search Plugin",
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
      remarkPlugins: [addSections],
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
      remarkPlugins: [addSections],
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
      remarkPlugins: [addSections],
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

  test('wraps headings with Section component when provided', async () => {
    const mdxSource = `# Hello`
    const calls: Array<any> = []

    function SectionOverride() {
      return null
    }

    const jsxStub = (type: any, props: any) => {
      calls.push({ type, props })
      return null
    }

    const mdxModule = await evaluate(mdxSource, {
      remarkPlugins: [addSections],
      development: false,
      Fragment: Symbol.for('react.fragment'),
      jsx: jsxStub,
      jsxs: jsxStub,
    })

    mdxModule.default({ components: { Section: SectionOverride } })

    const sectionInvocation = calls.find(
      (component) => component.type === SectionOverride
    )

    expect(sectionInvocation?.props).toMatchInlineSnapshot(`
      {
        "children": null,
        "depth": 1,
        "id": "hello",
        "title": "Hello",
      }
    `)
  })

  test('throws when exporting sections directly', async () => {
    const mdxSource = `
export const sections = []

# Hello
`

    const vfile = await compile(mdxSource, {
      remarkPlugins: [addSections],
    })
    const messages = (vfile as any).messages as Array<any>
    const hasFatal = messages.some(
      (message) =>
        message.fatal &&
        /Exporting \"sections\" directly is not supported/i.test(message.reason)
    )
    expect(hasFatal).toBe(true)
  })

  test('handles JSX heading elements with id attribute', async () => {
    const mdxSource = `<h1 id="intro">Introduction</h1>

<h2 id="details">The Details</h2>
`

    const jsxRuntime = {
      Fragment: Symbol.for('react.fragment'),
      jsx: () => null,
      jsxs: () => null,
    }

    const mdxModule = await evaluate(mdxSource, {
      remarkPlugins: [addSections],
      development: false,
      ...jsxRuntime,
    })

    expect(mdxModule.sections).toMatchInlineSnapshot(`
      [
        {
          "children": [
            {
              "depth": 2,
              "id": "details",
              "jsx": "The Details",
              "title": "The Details",
            },
          ],
          "depth": 1,
          "id": "intro",
          "jsx": "Introduction",
          "title": "Introduction",
        },
      ]
    `)
  })

  test('handles custom heading tags via options', async () => {
    const mdxSource = `# Markdown Heading

<Heading id="custom-heading">Custom Heading Component</Heading>
`

    const jsxRuntime = {
      Fragment: Symbol.for('react.fragment'),
      jsx: () => null,
      jsxs: () => null,
    }

    const mdxModule = await evaluate(mdxSource, {
      remarkPlugins: [[addSections, { headingTags: ['Heading'] }]],
      development: false,
      ...jsxRuntime,
    })

    expect(mdxModule.sections).toMatchInlineSnapshot(`
      [
        {
          "children": [
            {
              "depth": 2,
              "id": "custom-heading",
              "jsx": "Custom Heading Component",
              "title": "Custom Heading Component",
            },
          ],
          "depth": 1,
          "id": "markdown-heading",
          "jsx": "Markdown Heading",
          "title": "Markdown Heading",
        },
      ]
    `)
  })

  test('handles section tags via options', async () => {
    const mdxSource = `<Section id="getting-started" title="Getting Started" depth={1}>
Some content here
</Section>

<Section id="advanced" title="Advanced Usage" depth={2}>
More content
</Section>
`

    const jsxRuntime = {
      Fragment: Symbol.for('react.fragment'),
      jsx: () => null,
      jsxs: () => null,
    }

    const mdxModule = await evaluate(mdxSource, {
      remarkPlugins: [[addSections, { sectionTags: ['Section'] }]],
      development: false,
      ...jsxRuntime,
    })

    expect(mdxModule.sections).toMatchInlineSnapshot(`
      [
        {
          "children": [
            {
              "depth": 2,
              "id": "advanced",
              "title": "Advanced Usage",
            },
          ],
          "depth": 1,
          "id": "getting-started",
          "title": "Getting Started",
        },
      ]
    `)
  })

  test('preserves JSX formatting in JSX heading elements', async () => {
    const result = await compile(
      `<h1 id="intro">Hello <code>world</code>!</h1>`,
      { remarkPlugins: [addSections] }
    )

    const code = String(result)
    expect(code).toContain('export const sections = [{')
    // Should contain JSX fragment with code element
    expect(code).toContain('jsx:')
    expect(code).toContain('_jsx("code"')
  })

  test('combines markdown headings with JSX heading elements', async () => {
    const mdxSource = `# Overview

Some intro text.

<h2 id="jsx-section">JSX Section</h2>

## Markdown Section

More content.
`

    const jsxRuntime = {
      Fragment: Symbol.for('react.fragment'),
      jsx: () => null,
      jsxs: () => null,
    }

    const mdxModule = await evaluate(mdxSource, {
      remarkPlugins: [addSections],
      development: false,
      ...jsxRuntime,
    })

    expect(mdxModule.sections).toMatchInlineSnapshot(`
      [
        {
          "children": [
            {
              "depth": 2,
              "id": "jsx-section",
              "jsx": "JSX Section",
              "title": "JSX Section",
            },
            {
              "depth": 2,
              "id": "markdown-section",
              "jsx": "Markdown Section",
              "summary": "More content.",
              "title": "Markdown Section",
            },
          ],
          "depth": 1,
          "id": "overview",
          "jsx": "Overview",
          "summary": "Some intro text.",
          "title": "Overview",
        },
      ]
    `)
  })

  test('regions create nested sections and summaries', async () => {
    const mdxSource = `# Alpha

This is the alpha introduction paragraph which should be used as the summary for the Alpha heading.

{/* #region Details */}

This region contains additional details that should become its own section summary.

{/* #endregion */}

## Beta

This is the beta summary paragraph.
`

    const jsxRuntime = {
      Fragment: Symbol.for('react.fragment'),
      jsx: () => null,
      jsxs: () => null,
    }

    const mdxModule = await evaluate(mdxSource, {
      remarkPlugins: [addSections],
      development: false,
      ...jsxRuntime,
    })

    expect(mdxModule.sections).toMatchObject([
      {
        id: 'alpha',
        title: 'Alpha',
        depth: 1,
        summary: expect.stringContaining('alpha introduction paragraph'),
        children: [
          {
            id: 'details',
            title: 'Details',
            depth: 2,
            summary: expect.stringContaining('additional details'),
          },
          {
            id: 'beta',
            title: 'Beta',
            depth: 2,
            summary: expect.stringContaining('beta summary paragraph'),
          },
        ],
      },
    ])
  })

  test('regions cannot wrap headings', async () => {
    const result = await compile(
      `{/* #region Bad */}
# Title
{/* #endregion */}`,
      {
        remarkPlugins: [addSections],
      }
    )

    const hasError = result.messages.some((message) =>
      /Regions cannot contain headings/i.test(message.reason)
    )
    expect(hasError).toBe(true)
  })
})
