import {
  Reference as DefaultReference,
  type ReferenceProps,
  type ReferenceComponents,
} from 'renoun'

/** Custom Reference component that shadows the app's default. */
export function Reference(props: ReferenceProps) {
  const components = {
    DetailHeading: (headingProps) => (
      <h4
        {...headingProps}
        className="mt-0 mb-2 text-sm text-indigo-500 dark:text-indigo-400"
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

