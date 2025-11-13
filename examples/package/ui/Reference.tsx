import {
  Reference as DefaultReference,
  type ReferenceProps,
  type ReferenceComponents,
} from 'renoun'

export function Reference(props: ReferenceProps) {
  const components = {
    DetailHeading: (headingProps) => (
      <h4
        {...headingProps}
        className="mt-0 mb-2 text-sm text-gray-500 dark:text-gray-400"
      />
    ),
  } satisfies Partial<ReferenceComponents>

  return (
    <DefaultReference
      {...props}
      components={{ ...components, ...props.components }}
    />
  )
}


