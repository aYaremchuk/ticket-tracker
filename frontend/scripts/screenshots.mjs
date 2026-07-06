/**
 * Screenshot every prototype screen for wireframe comparison.
 *
 * Usage:
 *   npm run build && npm run preview &   # serves dist on :4173
 *   npm run screens
 *
 * PNGs land in <repo>/docs/screens/<name>.png at 1440x900.
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173'
const OUT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../docs/screens',
)

const SHOTS = [
  { name: 'login', route: '/login' },
  { name: 'signup', route: '/signup' },
  { name: 'verify', route: '/verify' },
  { name: 'verify-error', route: '/verify?status=error' },
  { name: 'board', route: '/board' },
  { name: 'ticket-details', route: '/tickets/1042' },
  { name: 'teams', route: '/teams' },
  { name: 'epics', route: '/epics' },
]

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  })

  try {
    for (const { name, route } of SHOTS) {
      const url = new URL(route, BASE_URL).toString()
      await page.goto(url, { waitUntil: 'networkidle' })
      const file = path.join(OUT_DIR, `${name}.png`)
      await page.screenshot({ path: file })
      console.log(`saved ${file}`)
    }
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
