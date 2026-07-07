/**
 * M4 Tickets + Comments E2E QA Script
 * Jessica (QA Engineer) — exercises the full ticket lifecycle plus comment
 * flows and the team/epic delete guards when tickets exist.
 *
 * Usage:
 *   node scripts/m4-tickets-qa.mjs [timestamp]
 *
 * Screenshots saved to /tmp/m4-qa/
 * Report printed to stdout.
 */
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:8080'
const OUT_DIR = '/tmp/m4-qa'

const ts = process.argv[2] ?? Date.now()
const TEST_EMAIL = `qa.m4.${ts}@example.com`
const TEST_PASSWORD = 'Secur3Pass!'
const TEAM_A = `M4-Team-A-${ts}`
const TEAM_B = `M4-Team-B-${ts}`
const TEAM_EMPTY = `M4-Empty-${ts}`
const EPIC_TITLE = `M4-Epic-${ts}`
const TICKET_TITLE = `M4-Ticket-${ts}`
const TICKET_TITLE_EDITED = `M4-Ticket-${ts}-Edited`
const TICKET_BODY = 'Initial body for M4 QA ticket'

// ─── Result tracking ─────────────────────────────────────────────────────────
const results = []
const consoleErrors = []
const networkErrors = []
const raw422s = []

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

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[setup] ${msg.text()}`)
  })
  page.on('pageerror', (err) => consoleErrors.push(`[setup] PAGE_ERROR: ${err.message}`))

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

// ─── Helper: get team ID from team name via the options in the form ───────────
async function getTeamIdByName(page, teamName) {
  // Navigate to ticket create to get access to team select
  await gotoQuiet(page, `${BASE_URL}/tickets/new`)
  await page.waitForSelector('select', { timeout: 8_000 })

  // The first select is Team
  const teamSelect = page.locator('select').first()
  const options = await teamSelect.locator('option').all()
  for (const opt of options) {
    const text = await opt.textContent()
    const val = await opt.getAttribute('value')
    if (text?.includes(teamName)) {
      return val
    }
  }
  return null
}

// ─── Helper: create an epic for a team, return epic title ─────────────────────
async function createEpic(page, teamName, epicTitle) {
  await gotoQuiet(page, `${BASE_URL}/epics`)
  await page.waitForSelector('select[aria-label="Select team"]', { timeout: 8_000 })

  const opts = await page.locator('select[aria-label="Select team"] option').all()
  let teamVal = null
  for (const opt of opts) {
    const text = await opt.textContent()
    const val = await opt.getAttribute('value')
    if (text?.includes(teamName)) { teamVal = val; break }
  }
  if (teamVal) {
    await page.selectOption('select[aria-label="Select team"]', teamVal)
    await page.waitForTimeout(500)
  }

  await page.click('button:has-text("+ Create epic")')
  await page.waitForSelector('h2:has-text("Create epic")', { timeout: 5_000 })
  await page.fill('input[placeholder*="Checkout reliability"]', epicTitle)
  await page.click('button[type="submit"]:has-text("Create")')
  await page.waitForSelector('h2:has-text("Create epic")', { state: 'detached', timeout: 8_000 })
  await page.waitForSelector(`text=${epicTitle}`, { timeout: 8_000 })
  console.log(`  Created epic: ${epicTitle}`)
  return epicTitle
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  console.log('\n=== M4 Tickets + Comments QA — Ticket Tracker ===')
  console.log(`Test email  : ${TEST_EMAIL}`)
  console.log(`Team A      : ${TEAM_A}`)
  console.log(`Team B      : ${TEAM_B}`)
  console.log(`Empty team  : ${TEAM_EMPTY}`)
  console.log(`Epic title  : ${EPIC_TITLE}`)
  console.log(`Ticket title: ${TICKET_TITLE}`)
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

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[m4] ${msg.text()}`)
  })
  page.on('pageerror', (err) => consoleErrors.push(`[m4] PAGE_ERROR: ${err.message}`))

  page.on('response', (resp) => {
    const status = resp.status()
    const url = resp.url()
    const method = resp.request().method()
    if (status >= 400) {
      const entry = `${status} ${method} ${url}`
      if (status === 422) {
        raw422s.push(entry)
      } else if (!url.includes('/api/me')) {
        networkErrors.push(entry)
      }
    }
  })

  // ── Prerequisite: Create Team A, Team B, an empty team, and an Epic ─────────
  console.log('\n--- Prerequisite: Create teams and epic ---')
  try {
    await createTeam(page, TEAM_A)
    await createTeam(page, TEAM_B)
    await createTeam(page, TEAM_EMPTY)
    await createEpic(page, TEAM_A, EPIC_TITLE)
    pass('Prerequisite: Teams + Epic created', `Teams A/B/Empty + Epic "${EPIC_TITLE}" ready`, null)
  } catch (err) {
    console.error('\nFATAL: Prerequisites failed:', err.message)
    await browser.close()
    process.exitCode = 1
    return
  }

  // ── STEP 1: Create ticket ─────────────────────────────────────────────────
  console.log('\nStep 1: Create ticket')
  let ticketId = null
  let ticketUrl = null
  try {
    // Click "+ New ticket" via direct navigation (board still uses mock data)
    await gotoQuiet(page, `${BASE_URL}/tickets/new`)
    await page.waitForSelector('select', { timeout: 8_000 })

    const shot1a = await screenshot(page, '01a-ticket-create-page')

    // Select Team A in the first (Team) select
    const teamSelectLocator = page.locator('select').first()
    const teamOpts = await teamSelectLocator.locator('option').all()
    let teamAVal = null
    for (const opt of teamOpts) {
      const text = await opt.textContent()
      const val = await opt.getAttribute('value')
      if (text?.includes(TEAM_A)) { teamAVal = val; break }
    }

    if (!teamAVal) {
      const shot = await screenshot(page, '01-no-team-a')
      fail('Step 1: Create ticket — Team A in selector', `Team A "${TEAM_A}" not found in Team selector`, shot)
      throw new Error('Team A not found')
    }

    await page.selectOption('select', teamAVal)
    await page.waitForTimeout(800) // epics load

    // Select Type = Feature (should be default, but set explicitly)
    // Type is the second select
    const selects = page.locator('select')
    const selectCount = await selects.count()
    // selects: [Team, Type, Epic]
    // Select Type "feature"
    if (selectCount >= 2) {
      await selects.nth(1).selectOption('feature')
    }

    // Select the epic (3rd select) — find by EPIC_TITLE option
    let epicSelected = false
    if (selectCount >= 3) {
      const epicSelect = selects.nth(2)
      const epicOpts = await epicSelect.locator('option').all()
      for (const opt of epicOpts) {
        const text = await opt.textContent()
        const val = await opt.getAttribute('value')
        if (text?.includes(EPIC_TITLE) && val) {
          await epicSelect.selectOption(val)
          epicSelected = true
          break
        }
      }
    }
    console.log(`  Epic selected: ${epicSelected}`)

    // Fill Title
    await page.fill('input[placeholder*="Short summary"]', TICKET_TITLE)

    // Fill Body
    await page.fill('textarea[placeholder*="Describe the ticket"]', TICKET_BODY)

    const shot1b = await screenshot(page, '01b-ticket-form-filled')

    // Click "Create ticket"
    await page.click('button:has-text("Create ticket")')

    // Should navigate to /tickets/:uuid — wait for a UUID (not "new")
    // UUID v4 pattern: 8-4-4-4-12 hex chars
    await page.waitForURL(/\/tickets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, { timeout: 15_000 })

    ticketUrl = page.url()
    ticketId = ticketUrl.split('/tickets/')[1]
    console.log(`  Ticket created: ${ticketUrl}`)

    // Verify header shows TCK-<number>, created by, timestamps
    await page.waitForSelector('text=TCK-', { timeout: 8_000 })
    const metaText = await page.locator('p.text-sm.text-slate-500').first().textContent()
    console.log(`  Header meta: ${metaText?.trim()}`)

    const hasTCK = metaText?.includes('TCK-')
    const hasCreatedBy = metaText?.includes('Created by')
    const hasCreated = metaText?.includes('Created')
    const hasModified = metaText?.includes('Modified')

    // Ticket title
    await page.waitForSelector(`text=${TICKET_TITLE}`, { timeout: 8_000 })

    const shot1c = await screenshot(page, '01c-ticket-detail')

    if (hasTCK && hasCreatedBy && hasCreated && hasModified) {
      pass('Step 1: Create ticket — header meta', `TCK/Created by/timestamps present: "${metaText?.trim()}"`, shot1c)
    } else {
      fail('Step 1: Create ticket — header meta', `Missing header fields. meta="${metaText?.trim()}" TCK=${hasTCK} createdBy=${hasCreatedBy} created=${hasCreated} modified=${hasModified}`, shot1c)
    }

    // Reload — ticket should persist
    await page.reload({ waitUntil: 'networkidle' })
    const titleAfterReload = await page.locator(`text=${TICKET_TITLE}`).count()

    const shot1d = await screenshot(page, '01d-ticket-persists-reload')
    if (titleAfterReload > 0) {
      pass('Step 1: Create ticket — persists after reload', `"${TICKET_TITLE}" still present after reload`, shot1d)
    } else {
      fail('Step 1: Create ticket — persists after reload', `"${TICKET_TITLE}" not found after reload`, shot1d)
    }
  } catch (err) {
    const shot = await screenshot(page, '01-create-ticket-error')
    fail('Step 1: Create ticket', `Error: ${err.message}`, shot)
  }

  // ── STEP 2: Edit ticket — modified_at bumps ───────────────────────────────
  console.log('\nStep 2: Edit ticket — modified_at bumps')
  let modifiedAtBefore = null
  try {
    if (!ticketUrl) throw new Error('ticketUrl not set — step 1 likely failed')

    await gotoQuiet(page, ticketUrl)
    await page.waitForSelector('text=TCK-', { timeout: 8_000 })

    // Read the raw modified_at from the API before editing
    const apiUrl = ticketUrl.replace('/tickets/', '/api/tickets/')
    const rawBefore = await page.evaluate(async (url) => {
      const resp = await fetch(url, { credentials: 'include' })
      const data = await resp.json()
      return data.modified_at
    }, apiUrl)
    modifiedAtBefore = rawBefore
    console.log(`  modified_at before edit (raw): "${modifiedAtBefore}"`)

    const shot2a = await screenshot(page, '02a-before-edit')

    // Change the title via the title input in the edit form
    await page.waitForSelector('#ticket-edit-form', { timeout: 8_000 })
    const titleInput = page.locator('#ticket-edit-form input[placeholder*="Short summary"]')
    await titleInput.fill(TICKET_TITLE_EDITED)

    // Click Save and wait for Save button to go back to enabled state
    await page.click('button:has-text("Save")')
    await page.waitForTimeout(2500)

    // Read raw modified_at from the API after saving
    const rawAfter = await page.evaluate(async (url) => {
      const resp = await fetch(url, { credentials: 'include' })
      const data = await resp.json()
      return data.modified_at
    }, apiUrl)
    const modifiedAtAfter = rawAfter
    console.log(`  modified_at after edit (raw): "${modifiedAtAfter}"`)

    // Verify title changed in h1
    const titleInH1 = await page.locator('h1').first().textContent()
    console.log(`  H1 title: ${titleInH1}`)

    // Re-read display meta as well (for screenshot info)
    const metaAfter = await page.locator('p.text-sm.text-slate-500').first().textContent()
    const shot2b = await screenshot(page, '02b-after-edit')

    if (!modifiedAtBefore || !modifiedAtAfter) {
      fail('Step 2: Edit — modified_at bumps', `Could not read timestamps before="${modifiedAtBefore}" after="${modifiedAtAfter}"`, shot2b)
    } else if (modifiedAtAfter !== modifiedAtBefore) {
      pass('Step 2: Edit — modified_at bumps', `modified_at advanced in API: "${modifiedAtBefore}" → "${modifiedAtAfter}" | H1="${titleInH1?.trim()}"`, shot2b)
    } else {
      // Same ISO timestamp — might be within the same second, which is a genuine FAIL
      fail('Step 2: Edit — modified_at bumps', `modified_at DID NOT change in API: before="${modifiedAtBefore}" after="${modifiedAtAfter}"`, shot2b)
    }
  } catch (err) {
    const shot = await screenshot(page, '02-edit-error')
    fail('Step 2: Edit ticket — modified_at bumps', `Error: ${err.message}`, shot)
  }

  // ── STEP 3: Comment does NOT bump modified_at ─────────────────────────────
  console.log('\nStep 3: Comment does NOT bump modified_at')
  try {
    if (!ticketUrl) throw new Error('ticketUrl not set')

    await gotoQuiet(page, ticketUrl)
    await page.waitForSelector('text=TCK-', { timeout: 8_000 })

    // Read raw modified_at via API before adding comment
    const apiUrl = ticketUrl.replace('/tickets/', '/api/tickets/')
    const rawBeforeComment = await page.evaluate(async (url) => {
      const resp = await fetch(url, { credentials: 'include' })
      const data = await resp.json()
      return data.modified_at
    }, apiUrl)
    console.log(`  modified_at before comment (raw): "${rawBeforeComment}"`)

    const shot3a = await screenshot(page, '03a-before-comment')

    // Add a comment
    await page.fill('textarea[placeholder*="Write a comment"]', 'This is a QA test comment')
    await page.click('button:has-text("Post comment")')

    // Wait for comment to appear
    await page.waitForSelector('text=This is a QA test comment', { timeout: 10_000 })

    // Read raw modified_at via API after comment
    const rawAfterComment = await page.evaluate(async (url) => {
      const resp = await fetch(url, { credentials: 'include' })
      const data = await resp.json()
      return data.modified_at
    }, apiUrl)
    console.log(`  modified_at after comment (raw): "${rawAfterComment}"`)

    const shot3b = await screenshot(page, '03b-after-comment')

    // Verify comment appears with author and time
    const commentList = page.locator('ul li')
    const commentCount = await commentList.count()
    const firstComment = commentList.first()
    const commentAuthor = await firstComment.locator('span.font-bold').textContent()
    const commentTime = await firstComment.locator('span.shrink-0').textContent()
    const commentBody = await firstComment.locator('p').textContent()

    console.log(`  Comment count: ${commentCount}`)
    console.log(`  Comment author: "${commentAuthor}", time: "${commentTime}", body: "${commentBody}"`)

    const commentHasAuthor = !!commentAuthor && commentAuthor.length > 0
    const commentHasTime = !!commentTime && commentTime.length > 0

    // KEY RULE: modified_at must NOT change after adding a comment
    if (rawBeforeComment && rawAfterComment && rawBeforeComment === rawAfterComment) {
      pass(
        'Step 3: Comment does NOT bump modified_at',
        `modified_at unchanged in API: "${rawBeforeComment}" (correct). Comment shows author="${commentAuthor}" time="${commentTime}"`,
        shot3b
      )
    } else if (!rawBeforeComment || !rawAfterComment) {
      fail('Step 3: Comment does NOT bump modified_at', `Could not read API timestamps before="${rawBeforeComment}" after="${rawAfterComment}"`, shot3b)
    } else {
      fail(
        'Step 3: Comment INCORRECTLY bumped modified_at',
        `modified_at changed in API: "${rawBeforeComment}" → "${rawAfterComment}" — VIOLATION of the key rule`,
        shot3b
      )
    }

    // Sub-check: comment visible with author + time
    if (commentHasAuthor && commentHasTime && commentBody?.includes('QA test comment')) {
      pass('Step 3: Comment appears with author + time', `author="${commentAuthor}" time="${commentTime}" body="${commentBody?.trim()}"`, shot3b)
    } else {
      fail('Step 3: Comment appears with author + time', `author="${commentAuthor}" time="${commentTime}" body="${commentBody?.trim()}"`, shot3b)
    }
  } catch (err) {
    const shot = await screenshot(page, '03-comment-error')
    fail('Step 3: Comment does NOT bump modified_at', `Error: ${err.message}`, shot)
  }

  // ── STEP 4: Comment validation — empty comment → 422 error ───────────────
  console.log('\nStep 4: Comment validation — empty comment')
  try {
    if (!ticketUrl) throw new Error('ticketUrl not set')

    await gotoQuiet(page, ticketUrl)
    await page.waitForSelector('text=TCK-', { timeout: 8_000 })

    // Get current comment count to verify no new comment added
    await page.waitForSelector('ul li', { timeout: 5_000 }).catch(() => {})
    const commentCountBefore = await page.locator('ul li').count()

    // Attempt to post an empty comment — the frontend checks trim() before
    // calling the API, so an empty submit should be a no-op (handled client-side)
    // OR the server returns 422 if the frontend doesn't guard it.
    // The CommentsPanel.handlePost returns early if trimmed is empty.
    // Let's try submitting with whitespace-only to see if it hits the server.

    // Fill with whitespace only
    await page.fill('textarea[placeholder*="Write a comment"]', '   ')

    const shot4a = await screenshot(page, '04a-empty-comment-before-submit')

    await page.click('button:has-text("Post comment")')
    await page.waitForTimeout(2000) // wait for potential network request + UI update

    // Check for any error alert
    const alertCount = await page.locator('[role="alert"]').count()
    const commentCountAfter = await page.locator('ul li').count()

    const shot4b = await screenshot(page, '04b-empty-comment-after-submit')

    // The frontend trims before calling API, so we expect either:
    //   A) no new comment added (client-side guard, no 422)
    //   B) a 422 alert shown
    // Either way, the comment count must not increase

    const noNewComment = commentCountAfter <= commentCountBefore
    const hasError = alertCount > 0

    if (noNewComment && hasError) {
      const alertText = await page.locator('[role="alert"]').first().textContent()
      pass('Step 4: Empty comment → 422 inline error', `Alert: "${alertText?.trim()}" | comment count unchanged (${commentCountBefore}→${commentCountAfter})`, shot4b)
    } else if (noNewComment && !hasError) {
      // Frontend guards it silently — comment not added, no visible error
      // Check if the 422 was tracked in raw422s
      const has422 = raw422s.some(e => e.includes('/comments'))
      if (has422) {
        pass('Step 4: Empty comment → no new comment (422 from server, no UI bubble)', `422 in network log | count ${commentCountBefore}→${commentCountAfter}`, shot4b)
      } else {
        pass('Step 4: Empty comment → no new comment (client-side guard)', `Frontend trims and returns early. comment count unchanged (${commentCountBefore}→${commentCountAfter})`, shot4b)
      }
    } else {
      fail('Step 4: Empty comment → validation', `Comment count changed ${commentCountBefore}→${commentCountAfter} — empty comment WAS added`, shot4b)
    }
  } catch (err) {
    const shot = await screenshot(page, '04-empty-comment-error')
    fail('Step 4: Comment validation', `Error: ${err.message}`, shot)
  }

  // ── STEP 5: Team change resets epic ───────────────────────────────────────
  console.log('\nStep 5: Team change resets epic')
  try {
    if (!ticketUrl) throw new Error('ticketUrl not set')

    await gotoQuiet(page, ticketUrl)
    await page.waitForSelector('#ticket-edit-form', { timeout: 8_000 })

    const shot5a = await screenshot(page, '05a-before-team-change')

    // Get the current epic value — should be Team A's epic
    const epicSelectBefore = page.locator('#ticket-edit-form select').nth(3)
    // Note: edit form selects are [Team, Type, State, Epic] (State IS shown in edit mode)
    // Let's get all selects and find the Epic one by label
    const allSelects = page.locator('#ticket-edit-form select')
    const selectCount = await allSelects.count()
    console.log(`  Selects in edit form: ${selectCount}`)

    // The Epic select will have an "No epic" option
    let epicSelectIdx = -1
    for (let i = 0; i < selectCount; i++) {
      const opts = await allSelects.nth(i).locator('option').all()
      for (const opt of opts) {
        const text = await opt.textContent()
        if (text?.includes('No epic')) {
          epicSelectIdx = i
          break
        }
      }
      if (epicSelectIdx >= 0) break
    }
    console.log(`  Epic select index: ${epicSelectIdx}`)

    let epicValueBefore = null
    if (epicSelectIdx >= 0) {
      epicValueBefore = await allSelects.nth(epicSelectIdx).inputValue()
      console.log(`  Epic value before team change: "${epicValueBefore}"`)
    }

    // Change Team to Team B (the first/Team select)
    const teamSelect = page.locator('#ticket-edit-form select').first()
    const teamOpts = await teamSelect.locator('option').all()
    let teamBVal = null
    for (const opt of teamOpts) {
      const text = await opt.textContent()
      const val = await opt.getAttribute('value')
      if (text?.includes(TEAM_B)) { teamBVal = val; break }
    }

    if (!teamBVal) {
      const shot = await screenshot(page, '05-no-team-b')
      fail('Step 5: Team change resets epic', `Team B "${TEAM_B}" not found in Team selector`, shot)
      throw new Error('Team B not found')
    }

    await teamSelect.selectOption(teamBVal)
    await page.waitForTimeout(1000) // wait for epic select to update

    const shot5b = await screenshot(page, '05b-after-team-change')

    // Check epic select — should now show only "No epic" for Team B (no epics)
    let epicValueAfter = null
    if (epicSelectIdx >= 0) {
      epicValueAfter = await allSelects.nth(epicSelectIdx).inputValue()
      const epicOpts = await allSelects.nth(epicSelectIdx).locator('option').all()
      const epicOptTexts = []
      for (const opt of epicOpts) {
        epicOptTexts.push(await opt.textContent())
      }
      console.log(`  Epic options after team B selected: ${JSON.stringify(epicOptTexts)}`)
      console.log(`  Epic value after team change: "${epicValueAfter}"`)

      const teamAEpicStillInOpts = epicOptTexts.some(t => t?.includes(EPIC_TITLE))

      if (!teamAEpicStillInOpts && (epicValueAfter === '' || epicValueAfter === null)) {
        pass('Step 5: Team change resets epic — Team A epic cleared', `Epic selector shows only "No epic" after switching to Team B; value="${epicValueAfter}"`, shot5b)
      } else if (teamAEpicStillInOpts) {
        fail('Step 5: Team change resets epic', `Team A epic "${EPIC_TITLE}" STILL in epic options after switching to Team B`, shot5b)
      } else {
        pass('Step 5: Team change resets epic — epic reset', `Epic value after team change: "${epicValueAfter}" | Team A epic not in list`, shot5b)
      }
    } else {
      fail('Step 5: Team change resets epic', 'Epic select not found in form', shot5b)
    }

    // Save with Team B (no epic) — should succeed
    await page.click('button:has-text("Save")')
    await page.waitForTimeout(2000)

    const saveError = await page.locator('[role="alert"]').count()
    const shot5c = await screenshot(page, '05c-save-team-b')
    if (saveError === 0) {
      pass('Step 5: Save with Team B (no epic) succeeds', 'No error after save with Team B', shot5c)
    } else {
      const alertText = await page.locator('[role="alert"]').first().textContent()
      fail('Step 5: Save with Team B (no epic)', `Save error: "${alertText?.trim()}"`, shot5c)
    }
  } catch (err) {
    const shot = await screenshot(page, '05-team-change-error')
    fail('Step 5: Team change resets epic', `Error: ${err.message}`, shot)
  }

  // ── STEP 6: epic_team_mismatch guard ─────────────────────────────────────
  console.log('\nStep 6: epic_team_mismatch guard')
  try {
    if (!ticketUrl) throw new Error('ticketUrl not set')

    await gotoQuiet(page, ticketUrl)
    await page.waitForSelector('#ticket-edit-form', { timeout: 8_000 })

    // The ticket is currently on Team B. Team A's epic should not be selectable.
    // The TicketForm scopes epics to the selected team, so Team A's epic should
    // not even appear in the dropdown when Team B is selected.
    // Let's confirm by looking at epic options

    const allSelects = page.locator('#ticket-edit-form select')
    const selectCount = await allSelects.count()
    let epicSelectIdx = -1
    for (let i = 0; i < selectCount; i++) {
      const opts = await allSelects.nth(i).locator('option').all()
      for (const opt of opts) {
        const text = await opt.textContent()
        if (text?.includes('No epic')) {
          epicSelectIdx = i
          break
        }
      }
      if (epicSelectIdx >= 0) break
    }

    const shot6a = await screenshot(page, '06a-team-b-epic-options')

    if (epicSelectIdx >= 0) {
      const epicOpts = await allSelects.nth(epicSelectIdx).locator('option').all()
      const epicOptTexts = []
      for (const opt of epicOpts) {
        epicOptTexts.push(await opt.textContent())
      }
      console.log(`  Epic options (Team B): ${JSON.stringify(epicOptTexts)}`)

      const teamAEpicVisible = epicOptTexts.some(t => t?.includes(EPIC_TITLE))
      if (!teamAEpicVisible) {
        pass(
          'Step 6: epic_team_mismatch guard — UI layer',
          `Team A epic "${EPIC_TITLE}" NOT in epic selector when Team B is selected (UI prevents mismatch at selector level)`,
          shot6a
        )
      } else {
        // Team A epic is selectable — attempt to save and expect 422
        console.log('  Team A epic is visible in Team B context — attempting to select and save to test server guard')
        const epicSelect = allSelects.nth(epicSelectIdx)
        let teamAEpicVal = null
        for (const opt of epicOpts) {
          const text = await opt.textContent()
          const val = await opt.getAttribute('value')
          if (text?.includes(EPIC_TITLE) && val) { teamAEpicVal = val; break }
        }
        if (teamAEpicVal) {
          await epicSelect.selectOption(teamAEpicVal)
          await page.click('button:has-text("Save")')
          await page.waitForTimeout(2000)

          const alertVisible = await page.locator('[role="alert"]').count()
          const shot6b = await screenshot(page, '06b-mismatch-error')
          if (alertVisible > 0) {
            const alertText = await page.locator('[role="alert"]').first().textContent()
            const isMismatchError = alertText?.toLowerCase().includes('epic') || alertText?.toLowerCase().includes('team') || alertText?.toLowerCase().includes('mismatch')
            if (isMismatchError) {
              pass('Step 6: epic_team_mismatch guard — server 422', `Alert: "${alertText?.trim()}"`, shot6b)
            } else {
              fail('Step 6: epic_team_mismatch guard', `Alert shown but not mismatch error: "${alertText?.trim()}"`, shot6b)
            }
          } else {
            fail('Step 6: epic_team_mismatch guard', 'No error shown when saving Team-B ticket with Team-A epic', shot6b)
          }
        } else {
          fail('Step 6: epic_team_mismatch guard', 'Team A epic visible in Team B context but could not get its value', shot6a)
        }
      }
    } else {
      fail('Step 6: epic_team_mismatch guard', 'Epic select not found in form', shot6a)
    }
  } catch (err) {
    const shot = await screenshot(page, '06-mismatch-error')
    fail('Step 6: epic_team_mismatch guard', `Error: ${err.message}`, shot)
  }

  // ── STEP 7: Delete ticket ─────────────────────────────────────────────────
  console.log('\nStep 7: Delete ticket')
  try {
    if (!ticketUrl) throw new Error('ticketUrl not set')

    await gotoQuiet(page, ticketUrl)
    await page.waitForSelector('text=TCK-', { timeout: 8_000 })

    const shot7a = await screenshot(page, '07a-before-delete')

    // Click the "Delete" button which shows the confirm overlay
    await page.click('button:has-text("Delete")')

    // Confirm dialog should appear (role="alertdialog")
    await page.waitForSelector('[role="alertdialog"]', { timeout: 5_000 })
    const dialogTitle = await page.locator('[role="alertdialog"] h2').textContent()
    const dialogBody = await page.locator('[role="alertdialog"] p').first().textContent()
    console.log(`  Dialog title: "${dialogTitle}", body: "${dialogBody}"`)

    const shot7b = await screenshot(page, '07b-delete-confirm')

    const hasDeleteTitle = dialogTitle?.includes('Delete ticket')
    const hasUndone = dialogBody?.includes('cannot be undone')

    if (hasDeleteTitle && hasUndone) {
      pass('Step 7: Delete ticket — confirm dialog', `Title: "${dialogTitle}" | Body: "${dialogBody?.trim()}"`, shot7b)
    } else {
      fail('Step 7: Delete ticket — confirm dialog', `Unexpected dialog: title="${dialogTitle}" body="${dialogBody?.trim()}"`, shot7b)
    }

    // Click the danger "Delete" button in the dialog
    const deleteBtn = page.locator('[role="alertdialog"] button:has-text("Delete")')
    await deleteBtn.click()

    // Should navigate to /board
    await page.waitForURL(`${BASE_URL}/board`, { timeout: 10_000 })
    const shot7c = await screenshot(page, '07c-after-delete-board')
    pass('Step 7: Delete ticket — navigated to /board', `URL after delete: ${page.url()}`, shot7c)

    // Visit the deleted ticket URL — should show not-found or redirect
    await gotoQuiet(page, ticketUrl)
    await page.waitForTimeout(2000)
    const currentUrl = page.url()
    const notFoundAlert = await page.locator('[role="alert"]').count()
    const notFoundText = await page.locator('[role="alert"]').first().textContent().catch(() => '')
    const isOnBoard = currentUrl.includes('/board')
    const isTicketNotFound = notFoundAlert > 0 && (notFoundText?.toLowerCase().includes('not found') || notFoundText?.toLowerCase().includes('404'))

    const shot7d = await screenshot(page, '07d-deleted-ticket-url')

    if (isOnBoard) {
      pass('Step 7: Deleted ticket URL → redirected to /board', `Navigated away: ${currentUrl}`, shot7d)
    } else if (isTicketNotFound) {
      pass('Step 7: Deleted ticket URL → not-found shown', `Alert: "${notFoundText?.trim()}"`, shot7d)
    } else {
      // Could be "Ticket not found." rendered inline
      const ticketNotFoundInline = await page.locator('text=Ticket not found').count()
      if (ticketNotFoundInline > 0) {
        pass('Step 7: Deleted ticket URL → not-found inline', `"Ticket not found" shown at ${currentUrl}`, shot7d)
      } else {
        fail('Step 7: Deleted ticket URL — not gone', `At ${currentUrl} | notFoundAlert=${notFoundAlert} text="${notFoundText?.trim()}"`, shot7d)
      }
    }
  } catch (err) {
    const shot = await screenshot(page, '07-delete-error')
    fail('Step 7: Delete ticket', `Error: ${err.message}`, shot)
  }

  // ── STEP 8: Create a second ticket for guard tests, then test delete guards ─
  console.log('\nStep 8: Team/Epic delete guards')

  // First, create a fresh ticket on Team A with the Epic so the guards activate
  let guardTicketUrl = null
  try {
    await gotoQuiet(page, `${BASE_URL}/tickets/new`)
    await page.waitForSelector('select', { timeout: 8_000 })

    const teamSelectLocator = page.locator('select').first()
    const teamOpts = await teamSelectLocator.locator('option').all()
    let teamAVal = null
    for (const opt of teamOpts) {
      const text = await opt.textContent()
      const val = await opt.getAttribute('value')
      if (text?.includes(TEAM_A)) { teamAVal = val; break }
    }
    if (teamAVal) {
      await page.selectOption('select', teamAVal)
      await page.waitForTimeout(800)
    }

    // Select Epic
    const allSelects = page.locator('select')
    const selectCount = await allSelects.count()
    let epicSelected = false
    if (selectCount >= 3) {
      const epicSelect = allSelects.nth(2)
      const epicOpts = await epicSelect.locator('option').all()
      for (const opt of epicOpts) {
        const text = await opt.textContent()
        const val = await opt.getAttribute('value')
        if (text?.includes(EPIC_TITLE) && val) {
          await epicSelect.selectOption(val)
          epicSelected = true
          break
        }
      }
    }
    console.log(`  Guard ticket epic selected: ${epicSelected}`)

    await page.fill('input[placeholder*="Short summary"]', `M4-Guard-${ts}`)
    await page.fill('textarea[placeholder*="Describe the ticket"]', 'Guard ticket for delete guard test')
    await page.click('button:has-text("Create ticket")')
    await page.waitForURL(/\/tickets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, { timeout: 15_000 })
    guardTicketUrl = page.url()
    console.log(`  Guard ticket created: ${guardTicketUrl}`)
  } catch (err) {
    console.error(`  Warning: Could not create guard ticket: ${err.message}`)
  }

  // Now test the guards
  try {
    await gotoQuiet(page, `${BASE_URL}/teams`)
    await page.waitForSelector('tbody tr', { timeout: 10_000 })
    await page.waitForTimeout(1000) // let team data fully render

    const shot8a = await screenshot(page, '08a-teams-page')

    // Team A has a ticket → Delete should be disabled
    const teamARow = page.locator('tbody tr').filter({ hasText: TEAM_A })
    const teamARowCount = await teamARow.count()
    console.log(`  Team A rows: ${teamARowCount}`)

    // Team B has no tickets (the ticket was moved there in step 5, but then
    // we deleted it in step 7; however step 7 deleted the ticket). Check.
    const teamBRow = page.locator('tbody tr').filter({ hasText: TEAM_B })
    const teamBRowCount = await teamBRow.count()
    console.log(`  Team B rows: ${teamBRowCount}`)

    // Empty team
    const emptyTeamRow = page.locator('tbody tr').filter({ hasText: TEAM_EMPTY })
    const emptyTeamRowCount = await emptyTeamRow.count()
    console.log(`  Empty team rows: ${emptyTeamRowCount}`)

    let step8Pass = true
    const step8Details = []

    // Team A check (has a ticket via guard ticket)
    if (teamARowCount === 0) {
      step8Pass = false
      step8Details.push(`Team A "${TEAM_A}" NOT found in /teams table`)
    } else {
      const teamATicketCount = await teamARow.locator('td').nth(1).textContent()
      const teamAEpicCount = await teamARow.locator('td').nth(2).textContent()
      const teamADeleteBtn = teamARow.locator('button:has-text("Delete")')
      const teamADeleteDisabled = await teamADeleteBtn.getAttribute('disabled')
      const teamADeleteTitle = await teamADeleteBtn.getAttribute('title')
      console.log(`  Team A: tickets=${teamATicketCount?.trim()} epics=${teamAEpicCount?.trim()} deleteDisabled=${teamADeleteDisabled !== null}`)

      if (teamADeleteDisabled !== null) {
        step8Details.push(`Team A (tickets=${teamATicketCount?.trim()}) Delete DISABLED (correct)`)
      } else {
        step8Pass = false
        step8Details.push(`Team A (tickets=${teamATicketCount?.trim()}) Delete ENABLED — should be disabled (has tickets)`)
      }
    }

    // Empty team check
    if (emptyTeamRowCount === 0) {
      step8Pass = false
      step8Details.push(`Empty team "${TEAM_EMPTY}" NOT found in /teams table`)
    } else {
      const emptyDeleteBtn = emptyTeamRow.locator('button:has-text("Delete")')
      const emptyDeleteDisabled = await emptyDeleteBtn.getAttribute('disabled')
      console.log(`  Empty team Delete disabled: ${emptyDeleteDisabled !== null}`)

      if (emptyDeleteDisabled === null) {
        step8Details.push(`Empty team Delete ENABLED (correct)`)
      } else {
        step8Pass = false
        step8Details.push(`Empty team Delete DISABLED — should be enabled (no tickets/epics)`)
      }
    }

    // Note footer
    const footerNote = await page.locator('text=Delete is disabled while a team contains tickets or epics.').count()
    if (footerNote > 0) {
      step8Details.push('Footer note present (correct)')
    } else {
      step8Pass = false
      step8Details.push('Footer note "Delete is disabled while a team contains tickets or epics." NOT found')
    }

    const shot8b = await screenshot(page, '08b-team-delete-guard')
    if (step8Pass) {
      pass('Step 8: Team delete guard (has-tickets → disabled)', step8Details.join(' | '), shot8b)
    } else {
      fail('Step 8: Team delete guard (has-tickets → disabled)', step8Details.join(' | '), shot8b)
    }

    // Epic delete guard — the epic has a ticket → Delete button should be disabled
    await gotoQuiet(page, `${BASE_URL}/epics`)
    await page.waitForSelector('select[aria-label="Select team"]', { timeout: 8_000 })

    const teamOpts = await page.locator('select[aria-label="Select team"] option').all()
    let teamAVal = null
    for (const opt of teamOpts) {
      const text = await opt.textContent()
      const val = await opt.getAttribute('value')
      if (text?.includes(TEAM_A)) { teamAVal = val; break }
    }
    if (teamAVal) {
      await page.selectOption('select[aria-label="Select team"]', teamAVal)
      await page.waitForTimeout(1000)
    }

    await page.waitForSelector(`text=${EPIC_TITLE}`, { timeout: 8_000 })

    const epicRow = page.locator('tr').filter({ hasText: EPIC_TITLE })
    const epicRowCount = await epicRow.count()
    console.log(`  Epic row count: ${epicRowCount}`)

    const shot8c = await screenshot(page, '08c-epic-delete-guard')

    if (epicRowCount === 0) {
      fail('Step 8: Epic delete guard', `Epic "${EPIC_TITLE}" not found in /epics list for Team A`, shot8c)
    } else {
      const epicTicketCount = await epicRow.locator('td').nth(1).textContent()
      const epicDeleteBtn = epicRow.locator('button[aria-label*="Delete"]')
      const epicDeleteDisabled = await epicDeleteBtn.getAttribute('disabled')
      const epicDeleteTitle = await epicDeleteBtn.getAttribute('title')
      console.log(`  Epic: ticket_count=${epicTicketCount?.trim()} deleteDisabled=${epicDeleteDisabled !== null} title="${epicDeleteTitle}"`)

      if (epicDeleteDisabled !== null) {
        pass(
          'Step 8: Epic delete guard (has tickets → disabled)',
          `Epic "${EPIC_TITLE}" ticket_count=${epicTicketCount?.trim()} | Delete DISABLED | title="${epicDeleteTitle}"`,
          shot8c
        )
      } else {
        fail(
          'Step 8: Epic delete guard',
          `Epic "${EPIC_TITLE}" ticket_count=${epicTicketCount?.trim()} | Delete NOT DISABLED — should be disabled`,
          shot8c
        )
      }
    }

    // Check epic footer note
    const epicFooterNote = await page.locator('text=Delete is disabled while tickets reference the epic.').count()
    if (epicFooterNote > 0) {
      pass('Step 8: Epic delete guard footer note', '"Delete is disabled while tickets reference the epic." present', shot8c)
    } else {
      fail('Step 8: Epic delete guard footer note', '"Delete is disabled while tickets reference the epic." NOT found', shot8c)
    }
  } catch (err) {
    const shot = await screenshot(page, '08-guards-error')
    fail('Step 8: Team/Epic delete guards', `Error: ${err.message}`, shot)
  }

  await browser.close()

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(72))
  console.log('M4 TICKETS + COMMENTS QA REPORT')
  console.log('='.repeat(72))
  console.log(`Test email  : ${TEST_EMAIL}`)
  console.log(`Team A      : ${TEAM_A}`)
  console.log(`Team B      : ${TEAM_B}`)
  console.log(`Epic title  : ${EPIC_TITLE}`)
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

  if (raw422s.length > 0) {
    console.log(`\nExpected 422s (validation): ${raw422s.length}`)
    for (const e of raw422s) console.log(`  - ${e}`)
  }

  const significantErrors = networkErrors.filter(e => !e.includes('/api/me'))
  if (significantErrors.length > 0) {
    console.log('\nUnexpected Network Errors:')
    for (const e of significantErrors) console.log(`  - ${e}`)
  } else {
    console.log('Unexpected Network Errors: none')
  }

  if (consoleErrors.length > 0) {
    console.log('\nBrowser Console Errors:')
    for (const e of consoleErrors) console.log(`  - ${e}`)
  } else {
    console.log('Browser Console Errors: none')
  }

  console.log('='.repeat(72))

  if (failedCount > 0) {
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err)
  process.exitCode = 1
})
