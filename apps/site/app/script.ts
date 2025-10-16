/** Fixes iOS viewport scaling on input focus. */
export default function () {
  if (!CSS.supports('-webkit-overflow-scrolling', 'touch')) {
    return
  }

  const FOCUSABLE_SELECTOR = ['input', 'textarea'].join(',')
  const metaTag = document.querySelector(
    "meta[name='viewport']"
  ) as HTMLMetaElement
  let focused = false

  document.addEventListener(
    'focusin',
    (event) => {
      if (focused) return

      const target = event.target

      if (
        !(target instanceof HTMLElement) ||
        !target.matches(FOCUSABLE_SELECTOR)
      ) {
        return
      }

      /** Blur the input immediately otherwise iOS doesn't pick up the viewport change in time */
      target.blur()
      focused = true

      /** Add maximum-scale 1 to prevent scaling */
      if (metaTag) {
        metaTag.content += ', maximum-scale=1'
      }

      /** Refocus the input now that we've prevented scaling */
      target.focus()
    },
    true
  )

  document.addEventListener(
    'focusout',
    () => {
      focused = false
      /** Restore scaling on blur */
      if (metaTag) {
        metaTag.content = metaTag.content.replace(', maximum-scale=1', '')
      }
    },
    true
  )
}
