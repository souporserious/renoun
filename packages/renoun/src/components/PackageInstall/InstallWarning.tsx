'use client'

if (typeof window !== 'undefined') {
  const packageScript = document.getElementById('package-install-script')

  if (!packageScript) {
    const packageWarning = document.getElementById('package-install-warning')

    if (!packageWarning) {
      const element = document.createElement('div')

      element.innerHTML = `
       <div id="package-install-warning" style="font-family: sans-serif; background-color: #f8d7da; color: #721c24; padding: 1rem;">
         <strong>[renoun] Error:</strong> the "PackageInstall" component requires "PackageInstallScript" to be rendered in the root component before rendering "PackageInstall".
       </div>
     `

      document.documentElement.insertBefore(element, document.body)
    }
  }
}

/** @internal */
export function InstallWarning() {
  return null
}
