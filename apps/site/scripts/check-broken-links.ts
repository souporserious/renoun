import { exec, spawn, ChildProcess } from 'node:child_process'
import { URL } from 'node:url'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'

interface Link {
  url: string
  originUrl: string
  html: string
  status?: number | string
}

const baseUrl = 'http://localhost:3000'
const visitedPages = new Set<string>()
const brokenLinks: Link[] = []
const MAX_WAIT_TIME = 30000
const PING_INTERVAL = 2000

/** Check for `out` directory and run `pnpm build` if it doesn't exist. */
function ensureOutDirectory(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (fs.existsSync('out')) {
      return resolve()
    }

    console.log('Build directory does not exist. Running `pnpm build`...')

    exec('pnpm build', (error) => {
      if (error) {
        return reject(new Error(`Failed to run 'pnpm build': ${error.message}`))
      }
      resolve()
    })
  })
}

/** Serve the 'out' directory with `pnpm start`. */
async function serveOutDirectory(): Promise<ChildProcess> {
  const server = await new Promise<ChildProcess>((resolve, reject) => {
    console.log(`Preparing to serve 'out' directory...`)
    const serverProcess = spawn('pnpm', ['start'])

    serverProcess.on('error', (err) => {
      reject(new Error(`Failed to serve 'out' directory: ${err.message}`))
    })

    resolve(serverProcess)
  })

  await waitForServerReady(baseUrl)

  return server
}

/** Fetch a URL and extract all <a> href attributes. */
function fetchPage(url: string): Promise<Link[]> {
  return new Promise((resolve) => {
    const { protocol, hostname, pathname, port } = new URL(url)
    const options = { hostname, path: pathname, port }
    const request = (protocol === 'https:' ? https : http).get(
      options,
      (response) => {
        if (
          response.statusCode &&
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          const redirectedUrl = new URL(response.headers.location, baseUrl).href
          console.log(`Redirected to: ${redirectedUrl}`)
          return resolve(fetchPage(redirectedUrl))
        }

        let data = ''
        response.on('data', (chunk) => (data += chunk))
        response.on('end', () => {
          const links = extractLinks(data, url)
          resolve(links)
        })
      }
    )

    request.on('error', (err) => {
      console.error(`Failed to fetch ${url}: ${err.message}`)
      // Resolve with an empty array to continue crawling
      resolve([])
    })
  })
}

/** Ping the base URL to check if the server is ready. */
function waitForServerReady(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()

    const ping = () => {
      if (Date.now() - startTime > MAX_WAIT_TIME) {
        return reject(
          new Error('Server did not start within the expected time.')
        )
      }

      http
        .get(url, (response) => {
          if (response.statusCode === 200) {
            console.log('Server is ready!')
            resolve()
          } else {
            console.log(
              `Waiting for server... (Status: ${response.statusCode})`
            )
            setTimeout(ping, PING_INTERVAL)
          }
        })
        .on('error', () => {
          console.log('Waiting for server...')
          setTimeout(ping, PING_INTERVAL)
        })
    }

    ping()
  })
}

/** Extract links from raw HTML content and track the origin page. */
function extractLinks(html: string, originUrl: string): Link[] {
  const regex = /<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g
  const links: Link[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(html)) !== null) {
    const fullHtml = match[0]
    const href = match[1]
    const fullUrl = href.startsWith('/') ? baseUrl + href : href

    if (fullUrl.startsWith(baseUrl)) {
      links.push({
        html: fullHtml,
        url: fullUrl,
        originUrl,
      })
    }
  }

  return links
}

const checkedLinks = new Set<string>()

/** Send an HTTP/HTTPS GET request to check link validity. */
function checkLink(link: Link): Promise<void> {
  const { url, originUrl, html } = link

  if (checkedLinks.has(url)) {
    const brokenLink = brokenLinks.find((link) => link.url === url)

    if (brokenLink) {
      brokenLinks.push({
        url,
        originUrl,
        html,
        status: brokenLink.status,
      })
    }

    return Promise.resolve()
  }
  checkedLinks.add(url)

  return new Promise((resolve) => {
    const { protocol, hostname, pathname, port } = new URL(url)
    const options = { method: 'GET', hostname, path: pathname, port }

    const request = (protocol === 'https:' ? https : http).request(
      options,
      (response) => {
        if (response.statusCode && response.statusCode >= 400) {
          brokenLinks.push({
            url,
            originUrl,
            html,
            status: response.statusCode,
          })
        }
        resolve()
      }
    )

    request.on('error', (error) => {
      console.log(error)
      brokenLinks.push({
        url,
        originUrl,
        html,
        status: 'Network Error',
      })
      resolve()
    })

    request.end()
  })
}

/** Recursively crawl pages and check all links. */
async function crawlPage(url: string, originUrl: string): Promise<void> {
  if (visitedPages.has(url)) return
  visitedPages.add(url)

  const allLinks = await fetchPage(url)
  const internalLinks = allLinks.filter((link) => link.url.startsWith(baseUrl))

  // Check links on the current page
  await Promise.all(allLinks.map((link) => checkLink(link)))

  // Recursively crawl internal links
  await Promise.all(internalLinks.map((link) => crawlPage(link.url, url)))
}

/** Display broken links with full <a> tag HTML content. */
function displayBrokenLinks() {
  if (brokenLinks.length === 0) {
    console.log('No broken links found 🎉')
    return
  }

  console.log('Broken links found 🚨')

  // Group broken links by originUrl for better readability
  const groupedByPage: { [originUrl: string]: Link[] } = {}

  brokenLinks.forEach((link) => {
    if (!groupedByPage[link.originUrl]) {
      groupedByPage[link.originUrl] = []
    }
    groupedByPage[link.originUrl].push(link)
  })

  // Log each broken link by its origin page with the full <a> tag HTML content
  for (const [originUrl, links] of Object.entries(groupedByPage)) {
    console.log(`\n${originUrl.replace(baseUrl, '')}`)
    links.forEach((link) => {
      console.log(`[${link.status}]: ${link.html}`)
    })
  }
}

/** Main function to start the server, crawl links, and shut it down. */
;(async function main() {
  await ensureOutDirectory()
  let serverProcess: ChildProcess | undefined

  try {
    serverProcess = await serveOutDirectory()

    console.log('Starting broken link checker...')
    await crawlPage(baseUrl, baseUrl)
    displayBrokenLinks()
  } catch (error) {
    throw error
  } finally {
    if (serverProcess) {
      serverProcess.kill()
    }
    process.exit(0)
  }
})()
