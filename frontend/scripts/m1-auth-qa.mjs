/**
 * M1 Authentication E2E QA Script
 * Jessica (QA Engineer) — exercises the full auth happy path + key negatives.
 *
 * Usage:
 *   node scripts/m1-auth-qa.mjs [timestamp]
 *
 * Screenshots saved to /tmp/m1-qa/
 * Report printed to stdout.
 */
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:8080'
const OUT_DIR = '/tmp/m1-qa'

// Derive a unique email from timestamp arg or Date.now()
const ts = process.argv[2] ?? Date.now()
const TEST_EMAIL = `qa.m1.${ts}@example.com`
const TEST_PASSWORD = 'Secur3Pass!'

// ─── Result tracking ────────────────────────────────────────────────────────
const results = []
const consoleErrors = []

function pass(step, detail, screenshot) {
  results.push({ step, status: 'PASS', detail, screenshot })
  console.log(`  ✓ PASS  ${step}`)
  if (detail) console.log(`         ${detail}`)
  if (screenshot) console.log(`         Screenshot: ${screenshot}`)
}

function fail(step, detail, screenshot) {
  results.push({ step, status: 'FAIL', detail, screenshot })
  console.error(`  ✗ FAIL  ${step}`)
  if (detail) console.error(`         ${detail}`)
  if (screenshot) console.error(`         Screenshot: ${screenshot}`)
}

async function screenshot(page, name) {
  const file = `${OUT_DIR}/${name}.png`
  await page.screenshot({ path: file, fullPage: true })
  return file
}

// ─── Helper: wait for network quiet ─────────────────────────────────────────
async function gotoQuiet(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 15_000 })
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  console.log('\n=== M1 Auth QA — Ticket Tracker ===')
  console.log(`Test email : ${TEST_EMAIL}`)
  console.log(`App URL    : ${BASE_URL}`)
  console.log(`Out dir    : ${OUT_DIR}\n`)

  const browser = await chromium.launch({ headless: true })

  // ── STEP 1: Signup ──────────────────────────────────────────────────────
  console.log('Step 1: Signup')
  const signupCtx = await browser.newContext()
  const signupPage = await signupCtx.newPage()

  // Collect console errors
  signupPage.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[signup] ${msg.text()}`)
  })
  signupPage.on('pageerror', (err) => consoleErrors.push(`[signup] PAGE_ERROR: ${err.message}`))

  try {
    await gotoQuiet(signupPage, `${BASE_URL}/signup`)

    await signupPage.fill('input[type="email"]', TEST_EMAIL)
    await signupPage.fill('input[autocomplete="new-password"]', TEST_PASSWORD)
    // Confirm password is the second new-password field
    const pwFields = signupPage.locator('input[autocomplete="new-password"]')
    await pwFields.nth(1).fill(TEST_PASSWORD)

    // Click the submit button
    await signupPage.click('button[type="submit"]')

    // Wait for the "sent" confirmation state
    await signupPage.waitForSelector('text=Verification email sent', { timeout: 8_000 })

    const shot1 = await screenshot(signupPage, '01-signup-sent')
    pass('Step 1: Signup', '"Verification email sent" confirmation visible', shot1)
  } catch (err) {
    const shot1 = await screenshot(signupPage, '01-signup-error')
    fail('Step 1: Signup', `Error: ${err.message}`, shot1)
  }

  // ── STEP 2: Unverified login is blocked ────────────────────────────────
  console.log('\nStep 2: Unverified login is blocked')
  try {
    await gotoQuiet(signupPage, `${BASE_URL}/login`)

    await signupPage.fill('input[type="email"]', TEST_EMAIL)
    await signupPage.fill('input[type="password"]', TEST_PASSWORD)
    await signupPage.click('button[type="submit"]')

    // Wait for the amber unverified banner
    await signupPage.waitForSelector('[role="alert"]', { timeout: 8_000 })

    const alertText = await signupPage.textContent('[role="alert"]')
    const isUnverifiedBanner =
      alertText?.includes("isn't verified") ||
      alertText?.includes('not verified') ||
      alertText?.includes('Resend verification') ||
      alertText?.includes('resend') ||
      alertText?.includes('account isn')

    const shot2 = await screenshot(signupPage, '02-unverified-blocked')

    if (isUnverifiedBanner) {
      pass('Step 2: Unverified login blocked', `Banner text: "${alertText?.trim()}"`, shot2)
    } else {
      fail(
        'Step 2: Unverified login blocked',
        `Expected unverified banner but got: "${alertText?.trim()}"`,
        shot2,
      )
    }
  } catch (err) {
    const shot2 = await screenshot(signupPage, '02-unverified-error')
    fail('Step 2: Unverified login blocked', `Error: ${err.message}`, shot2)
  }

  // ── STEP 3: Verify via letter_opener ───────────────────────────────────
  console.log('\nStep 3: Verify via email link')
  let verificationUrl = null
  try {
    // Fetch the letter_opener page and find the latest email link
    await gotoQuiet(signupPage, `${BASE_URL}/letter_opener`)

    // The email list shows links like /letter_opener/<id>/rich
    // Click the first (most recent) email entry
    const emailLinks = signupPage.locator('a[href*="/letter_opener/"]').filter({
      hasNot: signupPage.locator('[href="/letter_opener/clear"]'),
    })

    // Filter out the base /letter_opener/ link and /letter_opener/clear
    const allEmailLinks = await signupPage.locator('a').all()
    let emailDetailLink = null
    for (const link of allEmailLinks) {
      const href = await link.getAttribute('href')
      if (href && href.match(/\/letter_opener\/\d+/) && !href.includes('clear')) {
        emailDetailLink = href
        break
      }
    }

    if (!emailDetailLink) {
      throw new Error('No email found in letter_opener')
    }

    console.log(`         Found email at: ${emailDetailLink}`)

    // Navigate to the rich HTML view
    const richUrl = emailDetailLink.includes('/rich')
      ? emailDetailLink
      : emailDetailLink.replace(/\/(plain|rich)?$/, '/rich')
    await gotoQuiet(signupPage, `${BASE_URL}${richUrl}`)

    const shot3a = await screenshot(signupPage, '03a-email-content')

    // Extract the verification link from the email body
    // The email contains a link with /verify?token=
    const pageContent = await signupPage.content()
    const verifyMatch = pageContent.match(/http[^"'<\s]+\/verify\?token=[^"'<\s]+/)
    if (!verifyMatch) {
      // Try href attribute
      const links = await signupPage.locator('a[href*="/verify"]').all()
      for (const link of links) {
        const href = await link.getAttribute('href')
        if (href?.includes('/verify?token=') || href?.includes('/verify')) {
          verificationUrl = href
          break
        }
      }
    } else {
      verificationUrl = verifyMatch[0]
    }

    if (!verificationUrl) {
      throw new Error('Could not find /verify?token= link in email body')
    }

    console.log(`         Verification URL found: ${verificationUrl.substring(0, 80)}...`)

    // Navigate to the verification link
    await gotoQuiet(signupPage, verificationUrl)

    // Wait for success state: "Email verified" heading
    await signupPage.waitForSelector('text=Email verified', { timeout: 8_000 })

    // Also check for "Continue to login" link
    const continueLink = await signupPage.locator('text=Continue to login').count()

    const shot3b = await screenshot(signupPage, '03b-email-verified')

    if (continueLink > 0) {
      pass('Step 3: Email verification', '"Email verified" + "Continue to login" shown', shot3b)
    } else {
      pass('Step 3: Email verification', '"Email verified" shown (no Continue link found)', shot3b)
    }
  } catch (err) {
    const shot3 = await screenshot(signupPage, '03-verify-error')
    fail('Step 3: Email verification', `Error: ${err.message}`, shot3)
  }

  // ── STEP 4: Login works after verify ──────────────────────────────────
  console.log('\nStep 4: Login works after verify')
  const mainCtx = await browser.newContext()
  const mainPage = await mainCtx.newPage()

  mainPage.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[login] ${msg.text()}`)
  })
  mainPage.on('pageerror', (err) => consoleErrors.push(`[login] PAGE_ERROR: ${err.message}`))

  try {
    await gotoQuiet(mainPage, `${BASE_URL}/login`)

    await mainPage.fill('input[type="email"]', TEST_EMAIL)
    await mainPage.fill('input[type="password"]', TEST_PASSWORD)
    await mainPage.click('button[type="submit"]')

    // Expect redirect to /board
    await mainPage.waitForURL(`${BASE_URL}/board`, { timeout: 10_000 })

    // Confirm the board page rendered — look for the nav or board content
    await mainPage.waitForSelector('text=TICKET TRACKER', { timeout: 8_000 })

    const currentUrl = mainPage.url()
    const shot4 = await screenshot(mainPage, '04-login-success-board')
    pass('Step 4: Login after verify', `Redirected to ${currentUrl}, board renders`, shot4)
  } catch (err) {
    const shot4 = await screenshot(mainPage, '04-login-error')
    fail('Step 4: Login after verify', `Error: ${err.message}`, shot4)
  }

  // ── STEP 5: Session persists on reload ────────────────────────────────
  console.log('\nStep 5: Session persists on reload')
  try {
    await mainPage.reload({ waitUntil: 'networkidle' })

    const currentUrl = mainPage.url()
    const onBoard = currentUrl.includes('/board')
    const shot5 = await screenshot(mainPage, '05-session-persist')

    if (onBoard) {
      pass('Step 5: Session persists', `Still on ${currentUrl} after reload`, shot5)
    } else {
      fail('Step 5: Session persists', `Expected /board after reload, got ${currentUrl}`, shot5)
    }
  } catch (err) {
    const shot5 = await screenshot(mainPage, '05-session-error')
    fail('Step 5: Session persists', `Error: ${err.message}`, shot5)
  }

  // ── STEP 6: Protected route guard (fresh context) ─────────────────────
  console.log('\nStep 6: Protected route guard (no cookies)')
  const freshCtx = await browser.newContext()
  const freshPage = await freshCtx.newPage()

  try {
    await gotoQuiet(freshPage, `${BASE_URL}/board`)

    // Should redirect to /login
    // ProtectedRoute renders null during 'loading' then redirects — wait for URL
    await freshPage.waitForURL(`${BASE_URL}/login`, { timeout: 10_000 })

    const currentUrl = freshPage.url()
    const shot6 = await screenshot(freshPage, '06-route-guard')
    pass('Step 6: Protected route guard', `Redirected to ${currentUrl}`, shot6)
  } catch (err) {
    // Check where we ended up
    const currentUrl = freshPage.url()
    const shot6 = await screenshot(freshPage, '06-route-guard-error')
    if (currentUrl.includes('/login')) {
      pass('Step 6: Protected route guard', `On /login (URL check passed)`, shot6)
    } else {
      fail(
        'Step 6: Protected route guard',
        `Expected /login but at ${currentUrl} — ${err.message}`,
        shot6,
      )
    }
  } finally {
    await freshCtx.close()
  }

  // ── STEP 7: Logout ────────────────────────────────────────────────────
  console.log('\nStep 7: Logout')
  try {
    // mainPage is still on /board from step 5
    const currentUrl = mainPage.url()
    if (!currentUrl.includes('/board')) {
      await gotoQuiet(mainPage, `${BASE_URL}/board`)
      await mainPage.waitForSelector('text=TICKET TRACKER', { timeout: 8_000 })
    }

    // Click the user menu button (shows the user's email)
    await mainPage.click('button[aria-haspopup="menu"]')

    // Wait for the dropdown menu to appear
    await mainPage.waitForSelector('[role="menu"]', { timeout: 5_000 })

    // Click "Log out" menu item
    await mainPage.click('[role="menuitem"]')

    // Wait for redirect to /login
    await mainPage.waitForURL(`${BASE_URL}/login`, { timeout: 8_000 })

    const shot7a = await screenshot(mainPage, '07a-logout-redirect')

    // Verify /board now bounces to /login
    await gotoQuiet(mainPage, `${BASE_URL}/board`)
    await mainPage.waitForURL(`${BASE_URL}/login`, { timeout: 8_000 })

    const finalUrl = mainPage.url()
    const shot7b = await screenshot(mainPage, '07b-board-after-logout')

    pass('Step 7: Logout', `Logout redirected to /login; /board bounces to ${finalUrl}`, shot7b)
    // Also record 7a
    results.push({
      step: 'Step 7a: Logout redirect to /login',
      status: 'PASS',
      detail: 'See screenshot',
      screenshot: shot7a,
    })
  } catch (err) {
    const shot7 = await screenshot(mainPage, '07-logout-error')
    fail('Step 7: Logout', `Error: ${err.message}`, shot7)
  }

  await mainCtx.close()
  await signupCtx.close()
  await browser.close()

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60))
  console.log('M1 AUTH QA REPORT')
  console.log('='.repeat(60))
  console.log(`Test email: ${TEST_EMAIL}`)
  console.log(`Timestamp : ${ts}\n`)

  let passed = 0
  let failed = 0
  for (const r of results) {
    const icon = r.status === 'PASS' ? 'PASS' : 'FAIL'
    console.log(`[${icon}] ${r.step}`)
    if (r.detail) console.log(`       ${r.detail}`)
    if (r.screenshot) console.log(`       Screenshot: ${r.screenshot}`)
    if (r.status === 'PASS') passed++
    else failed++
  }

  console.log('\n' + '-'.repeat(60))
  console.log(`Results: ${passed} passed, ${failed} failed`)

  if (consoleErrors.length > 0) {
    console.log('\nBrowser Console Errors:')
    for (const e of consoleErrors) {
      console.log(`  - ${e}`)
    }
  } else {
    console.log('Browser Console Errors: none')
  }

  console.log('='.repeat(60))

  if (failed > 0) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err)
  process.exitCode = 1
})
