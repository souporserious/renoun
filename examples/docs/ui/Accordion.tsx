export function Accordion({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <details
      className={`Accordion w-full bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden mb-4 [&::-webkit-details-marker]:hidden group [&:has(:focus-visible)]:bg-gray-200 [&:has(:focus-visible)]:dark:bg-gray-700`}
    >
      <style href="Accordion" precedence="Accordion">{`
        .Accordion {
          &::-webkit-details-marker {
            display: none;
          }

          &::details-content {
            display: block;
            height: 0;
            opacity: 0;
            overflow: hidden;
            transition: height 0.3s ease, opacity 0.5s ease, content-visibility 0.3s;
            transition-behavior: allow-discrete;
            interpolate-size: allow-keywords;
          }

          &[open]::details-content {
            height: auto;
            opacity: 1;
          }

          &[open] summary::before {
            rotate: 0deg;
          }

          p {
            margin: 0;
          }

          summary {
            &:focus {
              outline: none;
            }

            &::-webkit-details-marker {
              display: none;
            }

            &::before {
              content: "";
              flex-shrink: 0;
              width: 1.25rem;
              height: 1.25rem;
              margin-right: 1rem;
              background-image: ${createArrowDataURI('hsl(200deg 20% 62%)')};
              background-repeat: no-repeat;
              background-size: 1.25rem;
              transition: rotate 0.2s ease-in-out;
              rotate: -90deg;
            }
          }
        }
      `}</style>
      <summary className="text-heading-4 cursor-pointer select-none flex items-center p-6 focus:outline-none">
        {title}
      </summary>
      <div className="px-16 pb-6">{children}</div>
    </details>
  )
}

function createArrowDataURI(color: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='${color}'><path d='M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z'/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
