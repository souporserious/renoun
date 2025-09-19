import React from 'react'

const tableOfContentsActiveState = `
const getVisibilityRatio = (element) => {
  const rect = element.getBoundingClientRect();
  const scrollTop = window.scrollY;
  const scrollBottom = scrollTop + window.innerHeight;
  const top = scrollTop + rect.top;
  const bottom = scrollTop + rect.bottom;
  const visibleTop = Math.max(scrollTop, top);
  const visibleBottom = Math.min(scrollBottom, bottom);
  return Math.max(0, visibleBottom - visibleTop) / (bottom - top);
};
let previousActiveSectionId = null;
window.isSectionLinkActive = function (id) {
  const section = document.getElementById(id);
  if (!section) return;
  const currentVisibility = getVisibilityRatio(section);
  if (currentVisibility > 0) {
    if (previousActiveSectionId) {
      const previousSection = document.getElementById(previousActiveSectionId);
      const previousVisibility = getVisibilityRatio(previousSection);
      if (currentVisibility <= previousVisibility) return;
      const previousActiveLink = document.querySelector(\`[href="#\${previousActiveSectionId}"]\`);
      if (previousActiveLink) previousActiveLink.classList.remove("active");
    }
    previousActiveSectionId = id;
  }
  document.currentScript.parentElement.classList.toggle("active", currentVisibility > 0);
};
`.trim()
const source = `data:text/javascript;base64,${btoa(tableOfContentsActiveState)}`

/**
 * Global script for `TableOfContents`. Defines a `window.isSectionLinkActive` helper used by link inline scripts.
 * @internal
 */
export function TableOfContentsScript({ nonce }: { nonce?: string }) {
  return <script async nonce={nonce} src={source} />
}
