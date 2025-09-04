const { PUBLISHED_PACKAGES, WEBHOOK_URL } = process.env
const DEFAULT_OWNER_REPO = 'souporserious/renoun'
const ownerRepoCandidate =
  process.env.OWNER_REPO || process.env.GITHUB_REPOSITORY || DEFAULT_OWNER_REPO

function isValidOwnerRepo(value) {
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(value))
}

const OWNER_REPO = isValidOwnerRepo(ownerRepoCandidate)
  ? ownerRepoCandidate
  : DEFAULT_OWNER_REPO

async function main() {
  if (!WEBHOOK_URL) {
    console.log('No WEBHOOK_URL provided; skipping Discord notification.')
    return
  }

  if (!PUBLISHED_PACKAGES || PUBLISHED_PACKAGES.trim() === '') {
    console.log(
      'No PUBLISHED_PACKAGES provided; skipping Discord notification.'
    )
    return
  }

  let parsed
  try {
    parsed = JSON.parse(PUBLISHED_PACKAGES)
  } catch (err) {
    console.error('Invalid JSON in PUBLISHED_PACKAGES')
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    console.log('No packages parsed; skipping Discord notification.')
    return
  }

  const safePackages = parsed.filter(
    (pkg) =>
      pkg && typeof pkg.name === 'string' && typeof pkg.version === 'string'
  )

  if (safePackages.length === 0) {
    console.log('No valid packages to report; skipping Discord notification.')
    return
  }

  const lines = safePackages.map((pkg) => {
    const name = String(pkg.name)
    const version = String(pkg.version)
    const tag = `${name}@${version}`
    const url = `https://github.com/${OWNER_REPO}/releases/tag/${tag}`
    return `[${tag}](${url})`
  })

  // Respect Discord's 2000 character limit; keep headroom
  const limitedLines = lines.slice(0, 30)
  let message = `🚀 New packages released:\n${limitedLines.join('\n')}`
  if (message.length > 1800) {
    message = message.slice(0, 1800)
  }

  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: message,
      // Prevent accidental pings like @everyone or @here
      allowed_mentions: { parse: [] },
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    console.error(
      `Failed to send Discord webhook (${response.status}): ${text}`
    )
    process.exit(1)
  }

  console.log('Discord notification sent.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
