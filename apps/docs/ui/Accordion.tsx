import { ArrowIcon } from './ArrowIcon'

export function Accordion({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <details className="Accordion w-full bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden mb-4 [&::-webkit-details-marker]:hidden group [&:has(:focus-visible)]:bg-gray-200 [&:has(:focus-visible)]:dark:bg-gray-700">
      <style href="Accordion" precedence="Accordion">{`
        .Accordion {
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
            rotate: 90deg;
          }

          p {
            margin: 0;
          }

          summary {
            &:focus {
              outline: none;
            }

            &::before {
              content: "";
              flex-shrink: 0;
              width: 1.25rem;
              height: 1.25rem;
              margin-right: 1rem;
              background-image: ${ArrowIcon.toDataURI({ color: 'hsl(200deg 20% 62%)' })};
              background-repeat: no-repeat;
              background-size: 1.25rem;
              transition: rotate 0.2s ease-in-out;
            }
          }
        }
      `}</style>
      <summary className="text-heading-4 font-bold cursor-pointer select-none flex items-center p-6 focus:outline-none">
        {title}
      </summary>
      <div className="px-16 pb-6">{children}</div>
    </details>
  )
}
