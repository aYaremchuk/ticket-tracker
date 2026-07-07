/**
 * Swagger Auth QA Script — Jessica (QA Engineer)
 *
 * Verifies that a user can authorize in Swagger UI and call protected endpoints.
 * Auth scheme: session cookie + CSRF double-submit (X-CSRF-Token header).
 * Swagger is at http://docs:docs@localhost:8080/api-docs/index.html (HTTP Basic).
 *
 * Method B is used: page.evaluate fetch calls inside the localhost:8080 browser
 * context so cookies + withCredentials behave identically to swagger-ui.
 *
 * Usage:
 *   node scripts/swagger-auth-qa.mjs [timestamp]
 *
 * Screenshots saved to /tmp/swagger-qa/
 * Report printed to stdout.
 */
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:8080'
const SWAGGER_URL = 'http://docs:docs@localhost:8080/api-docs/index.html'
const OUT_DIR = '/tmp/swagger-qa'

const ts = process.argv[2] ?? Date.now()
const TEST_EMAIL = `qa.swagger.${ts}@example.com`
const TEST_PASSWORD = 'Secur3Pass!'

// ─── Result tracking ────────────────────────────────────────────────────────
const results = []
const consoleErrors = []

function pass(step, detail, screenshot) {
  results.push({ step, status: 'PASS', detail, screenshot })
  console.log(`  PASS  ${step}`)
  if (detail) console.log(`        ${detail}`)
  if (screenshot) console.log(`        Screenshot: ${screenshot}`)
}

function fail(step, detail, screenshot) {
  results.push({ step, status: 'FAIL', detail, screenshot })
  console.error(`  FAIL  ${step}`)
  if (detail) console.error(`        ${detail}`)
  if (screenshot) console.error(`        Screenshot: ${screenshot}`)
}

async function shot(page, name) {
  const file = `${OUT_DIR}/${name}.png`
  await page.screenshot({ path: file, fullPage: true })
  return file
}

async function gotoQuiet(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 })
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  console.log('\n=== Swagger Auth QA — Ticket Tracker ===')
  console.log(`Test email : ${TEST_EMAIL}`)
  console.log(`Swagger    : ${SWAGGER_URL}`)
  console.log(`Out dir    : ${OUT_DIR}\n`)

  const browser = await chromium.launch({ headless: true })

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1: Create and verify a new user so login can succeed
  // ─────────────────────────────────────────────────────────────────────────
  console.log('Phase 1: Create and verify test user')

  const setupCtx = await browser.newContext()
  const setupPage = await setupCtx.newPage()
  setupPage.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[setup] ${msg.text()}`)
  })

  // Step 1: Signup
  console.log('\nStep 1: Signup')
  try {
    await gotoQuiet(setupPage, `${BASE_URL}/signup`)
    await setupPage.fill('input[type="email"]', TEST_EMAIL)
    const pwFields = setupPage.locator('input[autocomplete="new-password"]')
    await pwFields.nth(0).fill(TEST_PASSWORD)
    await pwFields.nth(1).fill(TEST_PASSWORD)
    await setupPage.click('button[type="submit"]')
    await setupPage.waitForSelector('text=Verification email sent', { timeout: 10_000 })
    const s1 = await shot(setupPage, '01-signup-sent')
    pass('Step 1: Signup', `"Verification email sent" confirmed for ${TEST_EMAIL}`, s1)
  } catch (err) {
    const s1 = await shot(setupPage, '01-signup-error')
    fail('Step 1: Signup', `Error: ${err.message}`, s1)
    await setupCtx.close()
    await browser.close()
    process.exitCode = 1
    return
  }

  // Step 2: Verify via letter_opener
  console.log('\nStep 2: Verify email via letter_opener')
  try {
    await gotoQuiet(setupPage, `${BASE_URL}/letter_opener`)
    const s2a = await shot(setupPage, '02a-letter-opener')

    // Find the most recent email link
    const allLinks = await setupPage.locator('a').all()
    let emailDetailLink = null
    for (const link of allLinks) {
      const href = await link.getAttribute('href')
      if (href && href.match(/\/letter_opener\/\d+/) && !href.includes('clear')) {
        emailDetailLink = href
        break
      }
    }

    if (!emailDetailLink) throw new Error('No email found in letter_opener')

    const richUrl = emailDetailLink.replace(/\/(plain|rich)?$/, '/rich')
    await gotoQuiet(setupPage, `${BASE_URL}${richUrl}`)
    const s2b = await shot(setupPage, '02b-email-content')

    const pageContent = await setupPage.content()
    let verificationUrl = null
    const verifyMatch = pageContent.match(/http[^"'<\s]+\/verify\?token=[^"'<\s]+/)
    if (verifyMatch) {
      verificationUrl = verifyMatch[0]
    } else {
      const links = await setupPage.locator('a[href*="/verify"]').all()
      for (const link of links) {
        const href = await link.getAttribute('href')
        if (href?.includes('/verify')) { verificationUrl = href; break }
      }
    }

    if (!verificationUrl) throw new Error('Could not find /verify?token= link in email')
    console.log(`        Verification URL: ${verificationUrl.substring(0, 80)}...`)

    await gotoQuiet(setupPage, verificationUrl)
    await setupPage.waitForSelector('text=Email verified', { timeout: 10_000 })
    const s2c = await shot(setupPage, '02c-email-verified')
    pass('Step 2: Email verification', '"Email verified" shown', s2c)
  } catch (err) {
    const s2 = await shot(setupPage, '02-verify-error')
    fail('Step 2: Email verification', `Error: ${err.message}`, s2)
    await setupCtx.close()
    await browser.close()
    process.exitCode = 1
    return
  }

  await setupCtx.close()

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2: Open Swagger and confirm 17 endpoints load
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\nPhase 2: Swagger UI loads with all 17 endpoints')

  // NOTE: httpCredentials in the context is the correct way to supply HTTP Basic
  // auth for Swagger. Embedding credentials in the URL (docs:docs@host) causes
  // Swagger UI's internal fetch('/api-docs/v1/swagger.yaml') to fail with
  // "Request cannot be constructed from a URL that includes credentials".
  const swaggerCtx = await browser.newContext({
    httpCredentials: { username: 'docs', password: 'docs' },
  })
  const swaggerPage = await swaggerCtx.newPage()
  swaggerPage.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[swagger] ${msg.text()}`)
  })

  // Step 3: Open Swagger UI
  console.log('\nStep 3: Open Swagger UI')
  try {
    // Use plain URL (no credentials) — httpCredentials on the context handles Basic auth
    await gotoQuiet(swaggerPage, 'http://localhost:8080/api-docs/index.html')
    // Wait for swagger-ui to render operations
    await swaggerPage.waitForSelector('.opblock', { timeout: 20_000 })
    const opblockCount = await swaggerPage.locator('.opblock').count()
    const s3 = await shot(swaggerPage, '03-swagger-loaded')

    // Check for key sections
    const hasTeams = await swaggerPage.locator('text=Teams').count() > 0
    const hasTickets = await swaggerPage.locator('text=Tickets').count() > 0

    if (opblockCount >= 17 && hasTeams && hasTickets) {
      pass('Step 3: Swagger UI loaded', `${opblockCount} operations visible, Teams + Tickets sections present`, s3)
    } else {
      fail('Step 3: Swagger UI loaded', `Only ${opblockCount} operations visible (expected >= 17); Teams=${hasTeams} Tickets=${hasTickets}`, s3)
    }
  } catch (err) {
    const s3 = await shot(swaggerPage, '03-swagger-error')
    fail('Step 3: Swagger UI loaded', `Error: ${err.message}`, s3)
    await swaggerCtx.close()
    await browser.close()
    process.exitCode = 1
    return
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 3: Method B — prove the authorize flow via fetch in browser context
  // (same-origin fetch with credentials:include, replicating swagger-ui behavior)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\nPhase 3: Auth flow via fetch in browser context (Method B)')

  // Step 4: GET /api/csrf — obtain token
  console.log('\nStep 4: GET /api/csrf')
  let csrfToken = null
  try {
    const result = await swaggerPage.evaluate(async () => {
      const res = await fetch('/api/csrf', { credentials: 'include' })
      const body = await res.json()
      return { status: res.status, body }
    })
    const s4 = await shot(swaggerPage, '04-csrf-result')

    if (result.status === 200 && result.body?.csrf_token) {
      csrfToken = result.body.csrf_token
      pass('Step 4: GET /api/csrf', `Status 200, csrf_token received (${csrfToken.substring(0, 20)}...)`, s4)
    } else {
      fail('Step 4: GET /api/csrf', `Status ${result.status}, body: ${JSON.stringify(result.body)}`, s4)
    }
  } catch (err) {
    const s4 = await shot(swaggerPage, '04-csrf-error')
    fail('Step 4: GET /api/csrf', `Error: ${err.message}`, s4)
  }

  if (!csrfToken) {
    await swaggerCtx.close()
    await browser.close()
    process.exitCode = 1
    return
  }

  // Step 5: POST /api/login with CSRF token
  console.log('\nStep 5: POST /api/login (with X-CSRF-Token)')
  try {
    const result = await swaggerPage.evaluate(async ({ email, password, token }) => {
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
        },
        body: JSON.stringify({ email, password }),
      })
      const body = await res.json().catch(() => ({}))
      return { status: res.status, body }
    }, { email: TEST_EMAIL, password: TEST_PASSWORD, token: csrfToken })

    const s5 = await shot(swaggerPage, '05-login-result')

    const loginEmail = result.body?.email ?? result.body?.user?.email
    if (result.status === 200 && loginEmail) {
      pass('Step 5: POST /api/login', `Status 200, user email: ${loginEmail}`, s5)
    } else {
      fail('Step 5: POST /api/login', `Status ${result.status}, body: ${JSON.stringify(result.body)}`, s5)
    }
  } catch (err) {
    const s5 = await shot(swaggerPage, '05-login-error')
    fail('Step 5: POST /api/login', `Error: ${err.message}`, s5)
  }

  // Step 6: GET /api/me — confirms session cookie is set
  console.log('\nStep 6: GET /api/me (authenticated)')
  let meStatus = null
  try {
    const result = await swaggerPage.evaluate(async () => {
      const res = await fetch('/api/me', { credentials: 'include' })
      const body = await res.json().catch(() => ({}))
      return { status: res.status, body }
    })
    const s6 = await shot(swaggerPage, '06-me-result')
    meStatus = result.status

    const meEmail = result.body?.email ?? result.body?.user?.email
    if (result.status === 200 && meEmail) {
      pass('Step 6: GET /api/me', `Status 200, email: ${meEmail}`, s6)
    } else {
      fail('Step 6: GET /api/me', `Status ${result.status}, body: ${JSON.stringify(result.body)}`, s6)
    }
  } catch (err) {
    const s6 = await shot(swaggerPage, '06-me-error')
    fail('Step 6: GET /api/me', `Error: ${err.message}`, s6)
  }

  // Step 7: POST /api/teams — protected write endpoint
  console.log('\nStep 7: POST /api/teams (protected write)')
  const teamName = `QA-Swagger-${ts}`
  let createTeamStatus = null
  try {
    // Need a fresh CSRF token after login (session rotation may change it)
    const freshCsrf = await swaggerPage.evaluate(async () => {
      const res = await fetch('/api/csrf', { credentials: 'include' })
      const body = await res.json()
      return body.csrf_token
    })
    console.log(`        Using fresh CSRF token after login: ${freshCsrf?.substring(0, 20)}...`)

    const result = await swaggerPage.evaluate(async ({ name, token }) => {
      const res = await fetch('/api/teams', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
        },
        body: JSON.stringify({ name }),
      })
      const body = await res.json().catch(() => ({}))
      return { status: res.status, body }
    }, { name: teamName, token: freshCsrf })

    const s7 = await shot(swaggerPage, '07-create-team-result')
    createTeamStatus = result.status

    if (result.status === 201 && result.body?.name) {
      pass('Step 7: POST /api/teams', `Status 201, team created: "${result.body.name}"`, s7)
    } else {
      fail('Step 7: POST /api/teams', `Status ${result.status}, body: ${JSON.stringify(result.body)}`, s7)
    }
  } catch (err) {
    const s7 = await shot(swaggerPage, '07-create-team-error')
    fail('Step 7: POST /api/teams', `Error: ${err.message}`, s7)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 4: Confirm failure mode — login with NO X-CSRF-Token → 403
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\nPhase 4: Confirm failure mode (login without X-CSRF-Token)')

  // Step 8: POST /api/login without CSRF token → expect 403 csrf_invalid
  console.log('\nStep 8: POST /api/login WITHOUT X-CSRF-Token')
  try {
    const result = await swaggerPage.evaluate(async ({ email, password }) => {
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // Deliberately omitting X-CSRF-Token
        body: JSON.stringify({ email, password }),
      })
      const body = await res.json().catch(() => ({}))
      return { status: res.status, body }
    }, { email: TEST_EMAIL, password: TEST_PASSWORD })

    const s8 = await shot(swaggerPage, '08-no-csrf-result')
    const isCsrfError = result.status === 403 &&
      (result.body?.error?.code === 'csrf_invalid' ||
       result.body?.error?.message?.toLowerCase().includes('csrf') ||
       result.body?.error?.code?.toLowerCase().includes('csrf'))

    if (isCsrfError) {
      pass(
        'Step 8: Login without CSRF token (failure mode)',
        `Status 403, error code: ${result.body?.error?.code ?? 'unknown'} — confirms bare curl/fetch without token is rejected`,
        s8,
      )
    } else {
      fail(
        'Step 8: Login without CSRF token (failure mode)',
        `Expected 403 csrf_invalid, got status ${result.status}, body: ${JSON.stringify(result.body)}`,
        s8,
      )
    }
  } catch (err) {
    const s8 = await shot(swaggerPage, '08-no-csrf-error')
    fail('Step 8: Login without CSRF token (failure mode)', `Error: ${err.message}`, s8)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 5: Drive the Swagger DOM (Method A attempt for completeness)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\nPhase 5: Swagger DOM inspection (verify 17 endpoints and tags)')

  // Step 9: Count operations and verify tag sections
  console.log('\nStep 9: Count and verify Swagger operation blocks')
  try {
    const opblockCount = await swaggerPage.locator('.opblock').count()
    const tagSections = await swaggerPage.locator('.opblock-tag').allTextContents()
    const s9 = await shot(swaggerPage, '09-swagger-ops-count')

    const tagNames = tagSections.map(t => t.trim().split('\n')[0].trim()).filter(Boolean)
    console.log(`        Found tags: ${tagNames.join(', ')}`)

    if (opblockCount >= 17) {
      pass('Step 9: 17 endpoints in Swagger', `${opblockCount} .opblock elements found; tags: ${tagNames.join(', ')}`, s9)
    } else {
      fail('Step 9: 17 endpoints in Swagger', `Only ${opblockCount} found (expected >= 17)`, s9)
    }
  } catch (err) {
    const s9 = await shot(swaggerPage, '09-swagger-ops-error')
    fail('Step 9: 17 endpoints in Swagger', `Error: ${err.message}`, s9)
  }

  await swaggerCtx.close()
  await browser.close()

  // ─────────────────────────────────────────────────────────────────────────
  // Final Report
  // ─────────────────────────────────────────────────────────────────────────
  const SEP = '='.repeat(70)
  console.log('\n' + SEP)
  console.log('SWAGGER AUTH QA REPORT')
  console.log(SEP)
  console.log(`Test email : ${TEST_EMAIL}`)
  console.log(`Timestamp  : ${ts}`)
  console.log(`Method     : B (fetch in browser context, same-origin, credentials:include)`)
  console.log('')

  let passed = 0, failed = 0
  for (const r of results) {
    const icon = r.status === 'PASS' ? 'PASS' : 'FAIL'
    console.log(`[${icon}] ${r.step}`)
    if (r.detail) console.log(`       ${r.detail}`)
    if (r.screenshot) console.log(`       Screenshot: ${r.screenshot}`)
    r.status === 'PASS' ? passed++ : failed++
  }

  console.log('\n' + '-'.repeat(70))
  console.log(`Results: ${passed} passed, ${failed} failed`)

  if (consoleErrors.length > 0) {
    console.log('\nBrowser Console Errors:')
    for (const e of consoleErrors) console.log(`  - ${e}`)
  } else {
    console.log('Browser Console Errors: none')
  }

  console.log('\n' + SEP)
  console.log('HOW TO AUTHORIZE IN SWAGGER UI AND CALL A PROTECTED ENDPOINT')
  console.log(SEP)
  console.log(`
1. Open http://docs:docs@localhost:8080/api-docs/index.html in your browser.
   (The HTTP Basic prompt requires username "docs" and password "docs".)

2. Expand GET /api/csrf → click "Try it out" → click "Execute".
   Copy the csrf_token value from the response body.

3. Expand POST /api/login → click "Try it out".
   In the "X-CSRF-Token" header field paste the token from step 2.
   In the Request body enter:
     { "email": "your@email.com", "password": "yourpassword" }
   Click "Execute". Expect 200 with your user object.
   (The session cookie is now set in your browser — Swagger sends it automatically
   because swagger-ui is served from the same origin with credentials:include.)

4. Get a fresh CSRF token: expand GET /api/csrf → Try it out → Execute again.
   Use this new token for all subsequent write requests.

5. To call a protected write endpoint (e.g. POST /api/teams):
   - Expand POST /api/teams → Try it out.
   - Fill in the X-CSRF-Token header with the fresh token from step 4.
   - Set the request body: { "name": "My Team" }
   - Click Execute. Expect 201.

WHY bare curl/fetch without X-CSRF-Token fails:
   The backend enforces a CSRF double-submit pattern. Every state-changing request
   (POST/PATCH/DELETE) must include an X-CSRF-Token header that matches the
   csrf_token cookie value. Without it the server returns 403 csrf_invalid.
   Swagger UI's "Try it out" form includes a header field for this — you must
   manually fill it in after obtaining the token via GET /api/csrf.
`)
  console.log(SEP)

  if (failed > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error('\nFatal error:', err)
  process.exitCode = 1
})
