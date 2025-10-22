import { CodeBlock, CodeInline, MDXComponents } from "renoun"

export function useMDXComponents() {
  return {
    h1: (props) => {
      return <h1 level={1} {...props} />
    },
    h2: (props) => {
      return <h2 level={2} {...props} className="text-2xl font-bold mt-8 mb-4" />
    },
    h3: (props) => {
      return <h3 level={3} {...props} className="text-xl font-semibold mt-6 mb-3"/>
    },
    ul: (props) => {
      return <ul {...props} className="list-disc ml-6 my-4" />
    },
    ol: (props) => {
      return <ol {...props} className="list-decimal ml-6 my-4" />
    },
    a: (props) => {
      return <a {...props} className="text-primary underline hover:text-primary/80 transition-colors" />
    },
    p: (props) => {
      return <p {...props} className="leading-relaxed my-4" />
    },
    CodeBlock,
    CodeInline
  } satisfies MDXComponents
} 