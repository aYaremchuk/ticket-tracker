/**
 * UX Buttons QA Script
 * Jessica (QA Engineer) — verifies three recent UX fixes on ticket screens:
 *   1. Create ticket inline field errors (not just banner)
 *   2. Post comment button disabled when textarea is empty
 *   3. Save button disabled unless form is changed (and not blank)
 *
 * Usage:
 *   node scripts/ux-buttons-qa.mjs [timestamp]
 *
 * Screenshots saved to /tmp/ux-qa/
 * Report printed to stdout.
 */
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:8080'
const OUT_DIR = '/tmp/ux-qa'

const ts = process.argv[2] ?? Date.now()
const TEST_EMAIL = `qa.ux.${ts}@example.com`
const TEST_PASSWORD = 'Secur3Pass!'
const TEAM_NAME = `UX-QA-Team-${ts}`
const TICKET_TITLE = `UX-QA-Ticket-${ts}`
const TICKET_BODY = 'UX QA ticket body for button state verification'

// ─── Result tracking ─────────────────────────────────────────────────────────
const results = []

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

async function screenshot(page, name) {
  const file = `${OUT_DIR}/${name}.png`
  await page.screenshot({ path: file, fullPage: true })
  return file
}

async function gotoQuiet(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 25_000 })
}

// ─── Helper: sign up, verify email, and log in ───────────────────────────────
async function signupVerifyLogin(browser) {
  console.log('\n--- Setup: signup -> verify -> login ---')

  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  // Signup
  await gotoQuiet(page, `${BASE_URL}/signup`)
  await page.fill('input[type="email"]', TEST_EMAIL)
  const pwFields = page.locator('input[autocomplete="new-password"]')
  await pwFields.nth(0).fill(TEST_PASSWORD)
  await pwFields.nth(1).fill(TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForSelector('text=Verification email sent', { timeout: 10_000 })
  console.log('  Signup: OK')

  // Find verification link from letter_opener
  await gotoQuiet(page, `${BASE_URL}/letter_opener`)
  const allLinks = await page.locator('a').all()
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
  await gotoQuiet(page, `${BASE_URL}${richUrl}`)

  const pageContent = await page.content()
  const verifyMatch = pageContent.match(/http[^"'<\s]+\/verify\?token=[^"'<\s]+/)
  let verificationUrl = null
  if (verifyMatch) {
    verificationUrl = verifyMatch[0]
  } else {
    const links = await page.locator('a[href*="/verify"]').all()
    for (const link of links) {
      const href = await link.getAttribute('href')
      if (href?.includes('/verify')) {
        verificationUrl = href
        break
      }
    }
  }
  if (!verificationUrl) throw new Error('Could not find /verify?token= link in email')

  await gotoQuiet(page, verificationUrl)
  await page.waitForSelector('text=Email verified', { timeout: 10_000 })
  console.log('  Email verified: OK')

  // Login
  await gotoQuiet(page, `${BASE_URL}/login`)
  await page.fill('input[type="email"]', TEST_EMAIL)
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(`${BASE_URL}/board`, { timeout: 10_000 })
  console.log('  Login: OK')

  return { page, ctx }
}

// ─── Helper: create a team via /teams modal ───────────────────────────────────
async function createTeam(page, teamName) {
  await gotoQuiet(page, `${BASE_URL}/teams`)
  await page.click('button:has-text("+ Create team")')
  await page.waitForSelector('[role="dialog"]', { timeout: 5_000 })
  await page.fill('input[placeholder*="Platform Engineering"]', teamName)
  await page.click('button[type="submit"]')
  await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8_000 })
  await page.waitForSelector(`text=${teamName}`, { timeout: 8_000 })
  console.log(`  Created team: ${teamName}`)
  return teamName
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  console.log('\n=== UX Buttons QA — Ticket Tracker ===')
  console.log(`Test email  : ${TEST_EMAIL}`)
  console.log(`Team        : ${TEAM_NAME}`)
  console.log(`App URL     : ${BASE_URL}`)
  console.log(`Out dir     : ${OUT_DIR}`)

  const browser = await chromium.launch({ headless: true })

  let page
  try {
    const setup = await signupVerifyLogin(browser)
    page = setup.page
  } catch (err) {
    console.error('\nFATAL: Setup (signup/verify/login) failed:', err.message)
    await browser.close()
    process.exitCode = 1
    return
  }

  // ── Prerequisite: Create Team ─────────────────────────────────────────────
  console.log('\n--- Prerequisite: Create team ---')
  try {
    await createTeam(page, TEAM_NAME)
  } catch (err) {
    console.error('\nFATAL: Team creation failed:', err.message)
    await browser.close()
    process.exitCode = 1
    return
  }

  // ────────────────────────────────────────────────────────────────────────────
  // FIX 1: Create ticket — inline field errors
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Fix 1: Create ticket — inline field errors ---')
  try {
    await gotoQuiet(page, `${BASE_URL}/tickets/new`)
    await page.waitForSelector('select', { timeout: 8_000 })

    const shot1a = await screenshot(page, 'fix1-01-page-loaded')

    // Do NOT fill Title or Body — just click "Create ticket"
    await page.click('button:has-text("Create ticket")')
    await page.waitForTimeout(1000)

    const shot1b = await screenshot(page, 'fix1-02-after-submit-blank')

    // Check URL: should NOT have navigated away from /tickets/new
    const currentUrl = page.url()
    const stayedOnPage = currentUrl.includes('/tickets/new') || currentUrl.endsWith('/tickets/new')
    if (stayedOnPage) {
      pass('Fix 1: No navigation on blank submit', `Stayed at ${currentUrl}`, shot1b)
    } else {
      fail('Fix 1: No navigation on blank submit', `NAVIGATED AWAY to: ${currentUrl}`, shot1b)
    }

    // Check for inline error near Title field
    // Inline errors are typically rendered as small text elements near the field,
    // NOT just a top-level banner/alert. We look for error text in the form itself.
    const pageText = await page.locator('body').innerText()
    const hasTitleError = pageText.toLowerCase().includes("title can't be blank") ||
                          pageText.toLowerCase().includes("title can't be blank")
    const hasBodyError = pageText.toLowerCase().includes("body can't be blank") ||
                         pageText.toLowerCase().includes("body can't be blank")

    // Now check: are these errors inline (NOT just a generic banner)?
    // An inline error lives near the input, not in a [role="alert"] banner at the top.
    // We probe specifically for inline error elements (common patterns: p.text-red, span.text-red,
    // .field-error, [data-testid*="error"], etc.)
    const inlineTitleErrorSelectors = [
      'p:has-text("Title can\'t be blank")',
      'span:has-text("Title can\'t be blank")',
      'div:has-text("Title can\'t be blank")',
      '[class*="error"]:has-text("Title")',
      '[data-testid*="error"]:has-text("Title")',
    ]
    const inlineBodyErrorSelectors = [
      'p:has-text("Body can\'t be blank")',
      'span:has-text("Body can\'t be blank")',
      'div:has-text("Body can\'t be blank")',
      '[class*="error"]:has-text("Body")',
      '[data-testid*="error"]:has-text("Body")',
    ]

    let titleInlineError = null
    let titleInlineSelector = null
    for (const sel of inlineTitleErrorSelectors) {
      const count = await page.locator(sel).count()
      if (count > 0) {
        titleInlineError = await page.locator(sel).first().textContent()
        titleInlineSelector = sel
        break
      }
    }

    let bodyInlineError = null
    let bodyInlineSelector = null
    for (const sel of inlineBodyErrorSelectors) {
      const count = await page.locator(sel).count()
      if (count > 0) {
        bodyInlineError = await page.locator(sel).first().textContent()
        bodyInlineSelector = sel
        break
      }
    }

    // Also check if there's only a top-level banner (which would be the OLD behavior)
    const bannerAlertCount = await page.locator('[role="alert"]').count()
    let bannerText = ''
    if (bannerAlertCount > 0) {
      bannerText = await page.locator('[role="alert"]').first().textContent()
    }
    console.log(`  Banner alerts count: ${bannerAlertCount}`)
    console.log(`  Banner text: "${bannerText?.trim()}"`)
    console.log(`  Inline Title error: "${titleInlineError}" (selector: ${titleInlineSelector})`)
    console.log(`  Inline Body error: "${bodyInlineError}" (selector: ${bodyInlineSelector})`)
    console.log(`  Page has title error text: ${hasTitleError}`)
    console.log(`  Page has body error text: ${hasBodyError}`)

    // Determine if errors are inline vs banner-only
    const titleIsInline = !!titleInlineError
    const bodyIsInline = !!bodyInlineError
    const titleErrorText = titleInlineError?.trim() ?? (hasTitleError ? 'found in page text (not isolated inline)' : 'NOT FOUND')
    const bodyErrorText = bodyInlineError?.trim() ?? (hasBodyError ? 'found in page text (not isolated inline)' : 'NOT FOUND')

    if (titleIsInline && bodyIsInline) {
      pass(
        'Fix 1: Inline field errors rendered',
        `Title error inline: "${titleErrorText}" | Body error inline: "${bodyErrorText}"`,
        shot1b
      )
    } else if (hasTitleError && hasBodyError && !titleIsInline) {
      // Errors appear somewhere in the page but not isolated inline
      // Let's dump all error-looking elements for debugging
      const allErrorEls = await page.locator('[class*="red"], [class*="error"], [class*="invalid"]').all()
      const errorElTexts = []
      for (const el of allErrorEls.slice(0, 10)) {
        const t = await el.textContent()
        if (t?.trim()) errorElTexts.push(t.trim().slice(0, 80))
      }
      console.log(`  Error-styled elements: ${JSON.stringify(errorElTexts)}`)
      fail(
        'Fix 1: Inline field errors — errors found but not confirmed inline',
        `Title error found: ${hasTitleError} (inline: ${titleIsInline}) | Body error found: ${hasBodyError} (inline: ${bodyIsInline}) | Banner: "${bannerText?.trim()}"`,
        shot1b
      )
    } else {
      fail(
        'Fix 1: Inline field errors — errors NOT found',
        `Title: ${hasTitleError} (inline: ${titleIsInline}) | Body: ${hasBodyError} (inline: ${bodyIsInline}) | Banner: "${bannerText?.trim()}"`,
        shot1b
      )
    }

    // Sub-check: type into Title → Title error should clear
    // Find and fill the title input
    const titleInput = page.locator('input[placeholder*="Short summary"]')
    const titleInputCount = await titleInput.count()
    if (titleInputCount > 0) {
      await titleInput.fill('Some title value')
      await page.waitForTimeout(500)

      const shot1c = await screenshot(page, 'fix1-03-after-typing-title')

      // Re-check title error: should be gone
      const titleErrorAfterTyping = await page.locator('body').innerText()
      const titleErrorStillPresent = titleErrorAfterTyping.toLowerCase().includes("title can't be blank")

      if (!titleErrorStillPresent) {
        pass('Fix 1: Title error clears after typing', 'Title error gone after filling Title field', shot1c)
      } else {
        fail('Fix 1: Title error clears after typing', 'Title error STILL PRESENT after filling Title field', shot1c)
      }
    } else {
      fail('Fix 1: Title error clears after typing', 'Could not find title input to type into', null)
    }
  } catch (err) {
    const shot = await screenshot(page, 'fix1-error')
    fail('Fix 1: Create ticket inline errors', `Error: ${err.message}`, shot)
  }

  // ────────────────────────────────────────────────────────────────────────────
  // FIX 2: Post comment button disabled when empty
  // First: create a real ticket to work with
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Fix 2: Post comment button disabled when empty ---')
  let ticketUrl = null
  try {
    // Create a ticket to work on
    await gotoQuiet(page, `${BASE_URL}/tickets/new`)
    await page.waitForSelector('select', { timeout: 8_000 })

    // Select the team we created
    const teamSelect = page.locator('select').first()
    const teamOpts = await teamSelect.locator('option').all()
    let teamVal = null
    for (const opt of teamOpts) {
      const text = await opt.textContent()
      const val = await opt.getAttribute('value')
      if (text?.includes(TEAM_NAME)) { teamVal = val; break }
    }
    if (!teamVal) throw new Error(`Team "${TEAM_NAME}" not found in selector`)

    await page.selectOption('select', teamVal)
    await page.waitForTimeout(500)

    await page.fill('input[placeholder*="Short summary"]', TICKET_TITLE)
    await page.fill('textarea[placeholder*="Describe the ticket"]', TICKET_BODY)
    await page.click('button:has-text("Create ticket")')
    await page.waitForURL(/\/tickets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, { timeout: 15_000 })
    ticketUrl = page.url()
    console.log(`  Ticket created: ${ticketUrl}`)

    // Wait for ticket detail page to load
    await page.waitForSelector('text=TCK-', { timeout: 8_000 })

    const shot2a = await screenshot(page, 'fix2-01-ticket-detail-loaded')

    // Find the "Post comment" button and comment textarea
    const postCommentBtn = page.locator('button:has-text("Post comment")')
    const commentTextarea = page.locator('textarea[placeholder*="Write a comment"]')

    const btnCount = await postCommentBtn.count()
    const textareaCount = await commentTextarea.count()
    console.log(`  Post comment button found: ${btnCount}`)
    console.log(`  Comment textarea found: ${textareaCount}`)

    if (btnCount === 0 || textareaCount === 0) {
      fail('Fix 2: Comment button/textarea found', `Button count: ${btnCount}, Textarea count: ${textareaCount}`, shot2a)
    } else {
      // CHECK A: Button should be DISABLED when textarea is empty
      const isDisabledWhenEmpty = await postCommentBtn.isDisabled()
      const disabledAttr = await postCommentBtn.getAttribute('disabled')
      console.log(`  Button disabled when empty: ${isDisabledWhenEmpty} (attr: "${disabledAttr}")`)

      const shot2b = await screenshot(page, 'fix2-02-button-when-empty')

      if (isDisabledWhenEmpty) {
        pass('Fix 2: Post comment button DISABLED when empty', `disabled=${isDisabledWhenEmpty} (attr="${disabledAttr}")`, shot2b)
      } else {
        fail('Fix 2: Post comment button DISABLED when empty', `Button is ENABLED when textarea is empty! disabled=${isDisabledWhenEmpty}`, shot2b)
      }

      // CHECK B: Type a non-space character → button should ENABLE
      await commentTextarea.fill('x')
      await page.waitForTimeout(300)

      const isDisabledAfterTyping = await postCommentBtn.isDisabled()
      console.log(`  Button disabled after typing 'x': ${isDisabledAfterTyping}`)

      const shot2c = await screenshot(page, 'fix2-03-button-after-typing')

      if (!isDisabledAfterTyping) {
        pass('Fix 2: Post comment button ENABLED after typing', `disabled=${isDisabledAfterTyping} after typing 'x'`, shot2c)
      } else {
        fail('Fix 2: Post comment button ENABLED after typing', `Button is STILL DISABLED after typing 'x'! disabled=${isDisabledAfterTyping}`, shot2c)
      }

      // CHECK C: Clear the textarea → button should DISABLE again
      await commentTextarea.fill('')
      await page.waitForTimeout(300)

      const isDisabledAfterClear = await postCommentBtn.isDisabled()
      console.log(`  Button disabled after clearing: ${isDisabledAfterClear}`)

      const shot2d = await screenshot(page, 'fix2-04-button-after-clear')

      if (isDisabledAfterClear) {
        pass('Fix 2: Post comment button DISABLED after clearing', `disabled=${isDisabledAfterClear} after clearing textarea`, shot2d)
      } else {
        fail('Fix 2: Post comment button DISABLED after clearing', `Button is ENABLED after clearing textarea! disabled=${isDisabledAfterClear}`, shot2d)
      }

      // CHECK D: Type spaces only → button should remain DISABLED
      await commentTextarea.fill('   ')
      await page.waitForTimeout(300)
      const isDisabledSpaceOnly = await postCommentBtn.isDisabled()
      console.log(`  Button disabled with spaces only: ${isDisabledSpaceOnly}`)

      const shot2e = await screenshot(page, 'fix2-05-button-spaces-only')
      if (isDisabledSpaceOnly) {
        pass('Fix 2: Post comment button DISABLED with spaces-only', `disabled=${isDisabledSpaceOnly} with whitespace-only text`, shot2e)
      } else {
        // Note: this is a stricter check; spaces-only might enable visually
        // but frontend should trim before enabling. Log as informational.
        fail('Fix 2: Post comment button DISABLED with spaces-only', `Button ENABLED with whitespace only! disabled=${isDisabledSpaceOnly}`, shot2e)
      }
    }
  } catch (err) {
    const shot = await screenshot(page, 'fix2-error')
    fail('Fix 2: Post comment button states', `Error: ${err.message}`, shot)
  }

  // ────────────────────────────────────────────────────────────────────────────
  // FIX 3: Save button disabled unless changed
  // ────────────────────────────────────────────────────────────────────────────
  console.log('\n--- Fix 3: Save button disabled unless changed ---')
  try {
    if (!ticketUrl) throw new Error('ticketUrl not set — Fix 2 likely failed to create ticket')

    // Reload ticket page fresh
    await gotoQuiet(page, ticketUrl)
    await page.waitForSelector('#ticket-edit-form', { timeout: 10_000 })

    // Read the original title value
    const titleInput = page.locator('#ticket-edit-form input[placeholder*="Short summary"]')
    const originalTitle = await titleInput.inputValue()
    console.log(`  Original title: "${originalTitle}"`)

    const saveBtn = page.locator('button:has-text("Save")')
    const saveBtnCount = await saveBtn.count()
    console.log(`  Save button found: ${saveBtnCount}`)

    if (saveBtnCount === 0) {
      fail('Fix 3: Save button found', 'Save button NOT found on ticket detail page', null)
    } else {
      // CHECK A: Save button DISABLED on fresh load (no edits)
      const shot3a = await screenshot(page, 'fix3-01-fresh-load')
      const isDisabledOnLoad = await saveBtn.isDisabled()
      const disabledAttrOnLoad = await saveBtn.getAttribute('disabled')
      console.log(`  Save button disabled on fresh load: ${isDisabledOnLoad} (attr: "${disabledAttrOnLoad}")`)

      if (isDisabledOnLoad) {
        pass('Fix 3: Save button DISABLED on fresh load', `disabled=${isDisabledOnLoad} (attr="${disabledAttrOnLoad}")`, shot3a)
      } else {
        fail('Fix 3: Save button DISABLED on fresh load', `Save button ENABLED on fresh load! disabled=${isDisabledOnLoad}`, shot3a)
      }

      // CHECK B: Change the Title → Save becomes ENABLED
      const newTitle = originalTitle + ' EDITED'
      await titleInput.fill(newTitle)
      await page.waitForTimeout(300)

      const isDisabledAfterChange = await saveBtn.isDisabled()
      console.log(`  Save button disabled after title change: ${isDisabledAfterChange}`)

      const shot3b = await screenshot(page, 'fix3-02-after-title-change')

      if (!isDisabledAfterChange) {
        pass('Fix 3: Save button ENABLED after title change', `disabled=${isDisabledAfterChange} after changing title to "${newTitle}"`, shot3b)
      } else {
        fail('Fix 3: Save button ENABLED after title change', `Save button STILL DISABLED after title change! disabled=${isDisabledAfterChange}`, shot3b)
      }

      // CHECK C: Revert to original value → Save becomes DISABLED again
      await titleInput.fill(originalTitle)
      await page.waitForTimeout(300)

      const isDisabledAfterRevert = await saveBtn.isDisabled()
      console.log(`  Save button disabled after reverting to original: ${isDisabledAfterRevert}`)

      const shot3c = await screenshot(page, 'fix3-03-after-title-revert')

      if (isDisabledAfterRevert) {
        pass('Fix 3: Save button DISABLED after reverting to original', `disabled=${isDisabledAfterRevert} after reverting to "${originalTitle}"`, shot3c)
      } else {
        fail('Fix 3: Save button DISABLED after reverting to original', `Save button STILL ENABLED after reverting to original! disabled=${isDisabledAfterRevert}`, shot3c)
      }

      // CHECK D: Blank out the Title → Save stays DISABLED (blank is not a valid save)
      await titleInput.fill('')
      await page.waitForTimeout(300)

      const isDisabledWhenBlank = await saveBtn.isDisabled()
      console.log(`  Save button disabled when title blanked: ${isDisabledWhenBlank}`)

      const shot3d = await screenshot(page, 'fix3-04-title-blanked')

      if (isDisabledWhenBlank) {
        pass('Fix 3: Save button DISABLED when title blanked', `disabled=${isDisabledWhenBlank} — blank title correctly prevents save`, shot3d)
      } else {
        fail('Fix 3: Save button DISABLED when title blanked', `Save button ENABLED with blank title! disabled=${isDisabledWhenBlank}`, shot3d)
      }
    }
  } catch (err) {
    const shot = await screenshot(page, 'fix3-error')
    fail('Fix 3: Save button disabled unless changed', `Error: ${err.message}`, shot)
  }

  await browser.close()

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(72))
  console.log('UX BUTTONS QA REPORT')
  console.log('='.repeat(72))
  console.log(`Test email  : ${TEST_EMAIL}`)
  console.log(`Team        : ${TEAM_NAME}`)
  console.log(`Timestamp   : ${ts}\n`)

  let passed = 0
  let failedCount = 0
  for (const r of results) {
    const icon = r.status === 'PASS' ? 'PASS' : 'FAIL'
    console.log(`[${icon}] ${r.step}`)
    if (r.detail) console.log(`       ${r.detail}`)
    if (r.screenshot) console.log(`       Screenshot: ${r.screenshot}`)
    if (r.status === 'PASS') passed++
    else failedCount++
  }

  console.log('\n' + '-'.repeat(72))
  console.log(`Results: ${passed} passed, ${failedCount} failed`)
  console.log('='.repeat(72))

  if (failedCount > 0) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err)
  process.exitCode = 1
})
