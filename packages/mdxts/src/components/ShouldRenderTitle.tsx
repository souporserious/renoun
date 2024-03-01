/**
 * Used in `mdxts/loader` to control whether the title should be rendered or not in an MDX file.
 * @internal
 */
export function ShouldRenderTitle({
  renderTitle = true,
  children,
}: {
  renderTitle?: boolean
  children: string
}) {
  return renderTitle ? children : null
}
