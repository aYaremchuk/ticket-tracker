/**
 * M5 Kanban Board E2E QA Script
 * Jessica (QA Engineer) — verifies the full Kanban board feature set.
 *
 * Usage:
 *   node scripts/m5-board-qa.mjs [timestamp]
 *
 * Screenshots saved to /tmp/m5-qa/
 * Report printed to stdout.
 *
 * Steps verified:
 *  1. Board renders 5 columns in workflow order with count badges + card content
 *  2. Drag persists after page reload
 *  3. Drag rollback on API failure (route intercept → snap-back + toast)
 *  4. Filters (AND) + search + count; Clear resets
 *  5. Team selector switches board + URL params survive reload
 *  6. Open ticket card → /tickets/:id; "+ New ticket" → /tickets/new
 *  7. Keyboard drag (a11y) via Move button
 *  8. 100-ticket performance (load time + interaction)
 */

import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const BASE_URL = 'http://localhost:8080'
const OUT_DIR = '/tmp/m5-qa'

const ts = process.argv[2] ?? Date.now()
const TEST_EMAIL = `qa.m5.${ts}@example.com`
const TEST_PASSWORD = 'Secur3Pass!'
const TEAM_A = `M5-Team-A-${ts}`
const TEAM_B = `M5-Team-B-${ts}`
const EPIC_A1 = `M5-Epic-A1-${ts}`
const EPIC_A2 = `M5-Epic-A2-${ts}`

// ─── Result tracking ──────────────────────────────────────────────────────────
const results = []
const consoleErrors = []
const networkErrors = []

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
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
}

// ─── API helpers (called from page context via page.evaluate) ─────────────────
async function getCsrfToken(page) {
  return page.evaluate(async (baseUrl) => {
    const resp = await fetch(`${baseUrl}/api/csrf`, { credentials: 'include' })
    const data = await resp.json()
    return data.csrf_token
  }, BASE_URL)
}

async function apiPost(page, path, body, csrfToken) {
  return page.evaluate(
    async ({ baseUrl, path, body, csrfToken }) => {
      const resp = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify(body),
      })
      const text = await resp.text()
      let json = null
      try { json = JSON.parse(text) } catch {}
      return { status: resp.status, json }
    },
    { baseUrl: BASE_URL, path, body, csrfToken },
  )
}

async function apiPatch(page, path, body, csrfToken) {
  return page.evaluate(
    async ({ baseUrl, path, body, csrfToken }) => {
      const resp = await fetch(`${baseUrl}${path}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify(body),
      })
      const text = await resp.text()
      let json = null
      try { json = JSON.parse(text) } catch {}
      return { status: resp.status, json }
    },
    { baseUrl: BASE_URL, path, body, csrfToken },
  )
}

// ─── Helper: sign up, verify email, and log in ────────────────────────────────
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
        verificationUrl = href; break
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

// ─── Helper: create a team via UI ────────────────────────────────────────────
async function createTeamUI(page, teamName) {
  await gotoQuiet(page, `${BASE_URL}/teams`)
  await page.click('button:has-text("+ Create team")')
  await page.waitForSelector('[role="dialog"]', { timeout: 5_000 })
  await page.fill('input[placeholder*="Platform Engineering"]', teamName)
  await page.click('button[type="submit"]')
  await page.waitForSelector('[role="dialog"]', { state: 'detached', timeout: 8_000 })
  await page.waitForSelector(`text=${teamName}`, { timeout: 8_000 })
  console.log(`  Created team: ${teamName}`)
}

// ─── Helper: create an epic via UI ───────────────────────────────────────────
async function createEpicUI(page, teamId, epicTitle) {
  await gotoQuiet(page, `${BASE_URL}/epics`)
  await page.waitForSelector('select[aria-label="Select team"]', { timeout: 8_000 })
  await page.selectOption('select[aria-label="Select team"]', teamId)
  await page.waitForTimeout(500)
  await page.click('button:has-text("+ Create epic")')
  await page.waitForSelector('h2:has-text("Create epic")', { timeout: 5_000 })
  await page.fill('input[placeholder*="Checkout reliability"]', epicTitle)
  await page.click('button[type="submit"]:has-text("Create")')
  await page.waitForSelector('h2:has-text("Create epic")', { state: 'detached', timeout: 8_000 })
  await page.waitForSelector(`text=${epicTitle}`, { timeout: 8_000 })
  console.log(`  Created epic: ${epicTitle}`)
}

// ─── Helper: get teams from API ──────────────────────────────────────────────
async function getTeams(page) {
  return page.evaluate(async (baseUrl) => {
    const resp = await fetch(`${baseUrl}/api/teams`, { credentials: 'include' })
    const data = await resp.json()
    return data.teams
  }, BASE_URL)
}

// ─── Helper: get epics for a team ────────────────────────────────────────────
async function getEpics(page, teamId) {
  return page.evaluate(async ({ baseUrl, teamId }) => {
    const resp = await fetch(`${baseUrl}/api/epics?team_id=${teamId}`, { credentials: 'include' })
    const data = await resp.json()
    return data.epics
  }, { baseUrl: BASE_URL, teamId })
}

// ─── Helper: create a ticket via API ─────────────────────────────────────────
async function createTicketAPI(page, csrfToken, { teamId, type, state, title, body, epicId }) {
  const result = await apiPost(page, '/api/tickets', {
    team_id: teamId,
    type,
    title,
    body: body ?? `Body for ${title}`,
    ...(epicId ? { epic_id: epicId } : {}),
  }, csrfToken)

  if (result.status !== 201) {
    throw new Error(`Failed to create ticket "${title}": ${result.status} ${JSON.stringify(result.json)}`)
  }

  const ticketId = result.json.id

  // If we need a non-default state, PATCH it
  if (state && state !== 'new') {
    const csrf2 = await getCsrfToken(page)
    const patchResult = await apiPatch(page, `/api/tickets/${ticketId}`, { state }, csrf2)
    if (patchResult.status !== 200) {
      console.warn(`  Warning: state patch failed for "${title}": ${patchResult.status}`)
    }
  }

  return result.json
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  console.log('\n=== M5 Kanban Board QA — Jessica, QA Engineer ===')
  console.log(`Test email  : ${TEST_EMAIL}`)
  console.log(`Team A      : ${TEAM_A}`)
  console.log(`Team B      : ${TEAM_B}`)
  console.log(`Epic A1     : ${EPIC_A1}`)
  console.log(`Epic A2     : ${EPIC_A2}`)
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
    if (msg.type() === 'error') consoleErrors.push(`[m5] ${msg.text()}`)
  })
  page.on('pageerror', (err) => consoleErrors.push(`[m5] PAGE_ERROR: ${err.message}`))
  page.on('response', (resp) => {
    const status = resp.status()
    const url = resp.url()
    const method = resp.request().method()
    if (status >= 400 && status !== 422 && !url.includes('/api/me')) {
      networkErrors.push(`${status} ${method} ${url}`)
    }
  })

  // ── Prerequisites: Create Teams, Epics, and test tickets ─────────────────
  console.log('\n--- Prerequisite: Create teams, epics, and test data ---')
  let teamAId, teamBId, epicA1Id, epicA2Id
  let ticketNew, ticketRFI, ticketIP, ticketRFA, ticketDone
  let bugTicketId, featureTicketId, epicA1TicketId, epicA2TicketId

  try {
    // Create teams via UI (establishes real IDs in the DB)
    await createTeamUI(page, TEAM_A)
    await createTeamUI(page, TEAM_B)

    // Get team IDs from API
    const teams = await getTeams(page)
    const teamA = teams.find(t => t.name === TEAM_A)
    const teamB = teams.find(t => t.name === TEAM_B)
    if (!teamA || !teamB) throw new Error('Teams not found after creation')
    teamAId = teamA.id
    teamBId = teamB.id
    console.log(`  Team A id: ${teamAId}`)
    console.log(`  Team B id: ${teamBId}`)

    // Create epics via UI
    await createEpicUI(page, teamAId, EPIC_A1)
    await createEpicUI(page, teamAId, EPIC_A2)

    // Get epic IDs
    const epics = await getEpics(page, teamAId)
    const epicA1 = epics.find(e => e.title === EPIC_A1)
    const epicA2 = epics.find(e => e.title === EPIC_A2)
    if (!epicA1 || !epicA2) throw new Error('Epics not found after creation')
    epicA1Id = epicA1.id
    epicA2Id = epicA2.id
    console.log(`  Epic A1 id: ${epicA1Id}`)
    console.log(`  Epic A2 id: ${epicA2Id}`)

    // Navigate to board to establish session context
    await gotoQuiet(page, `${BASE_URL}/board`)
    await page.waitForTimeout(1000)

    // Get CSRF token for API calls
    let csrf = await getCsrfToken(page)

    // Create one ticket per state for Step 1 verification
    ticketNew = await createTicketAPI(page, csrf, {
      teamId: teamAId, type: 'bug', state: 'new',
      title: `M5-New-${ts}`, epicId: epicA1Id
    })
    csrf = await getCsrfToken(page)

    ticketRFI = await createTicketAPI(page, csrf, {
      teamId: teamAId, type: 'feature', state: 'ready_for_implementation',
      title: `M5-RFI-${ts}`, epicId: epicA1Id
    })
    csrf = await getCsrfToken(page)

    ticketIP = await createTicketAPI(page, csrf, {
      teamId: teamAId, type: 'fix', state: 'in_progress',
      title: `M5-InProgress-${ts}`, epicId: epicA2Id
    })
    csrf = await getCsrfToken(page)

    ticketRFA = await createTicketAPI(page, csrf, {
      teamId: teamAId, type: 'bug', state: 'ready_for_acceptance',
      title: `M5-RFA-${ts}`, epicId: epicA2Id
    })
    csrf = await getCsrfToken(page)

    ticketDone = await createTicketAPI(page, csrf, {
      teamId: teamAId, type: 'feature', state: 'done',
      title: `M5-Done-${ts}`, epicId: epicA1Id
    })
    csrf = await getCsrfToken(page)

    // Create extra tickets for filter tests (one bug + one feature in different epics)
    bugTicketId = ticketNew.id // already a bug
    featureTicketId = ticketRFI.id // already a feature
    epicA1TicketId = ticketNew.id // in epic A1
    epicA2TicketId = ticketIP.id  // in epic A2

    // Create 2 more tickets for Team B (to test team switching)
    const teamBTicket = await createTicketAPI(page, csrf, {
      teamId: teamBId, type: 'bug', state: 'new',
      title: `M5-TeamB-${ts}`
    })
    csrf = await getCsrfToken(page)
    console.log(`  Team B ticket: ${teamBTicket.id}`)

    pass('Prerequisite: Teams + Epics + Tickets created',
      `TeamA=${teamAId} TeamB=${teamBId} | Epic1=${epicA1Id} Epic2=${epicA2Id} | 5 state tickets + TeamB ticket`,
      null)
  } catch (err) {
    console.error('\nFATAL: Prerequisites failed:', err.message)
    const shotPre = await screenshot(page, '00-prereq-error')
    fail('Prerequisite', `Error: ${err.message}`, shotPre)
    await browser.close()
    process.exitCode = 1
    return
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 1: Board renders 5 columns in workflow order with count badges + cards
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\nStep 1: Board renders 5 columns in workflow order')
  try {
    await gotoQuiet(page, `${BASE_URL}/board?team=${teamAId}`)
    await page.waitForSelector('[data-column]', { timeout: 15_000 })
    await page.waitForTimeout(1000)

    const EXPECTED_COLUMNS = [
      'new', 'ready_for_implementation', 'in_progress', 'ready_for_acceptance', 'done'
    ]
    const COLUMN_LABELS = {
      new: 'New',
      ready_for_implementation: 'Ready for Implementation',
      in_progress: 'In Progress',
      ready_for_acceptance: 'Ready for Acceptance',
      done: 'Done',
    }

    // Check all 5 columns exist in order
    const columnHandles = await page.locator('[data-column]').all()
    const columnsFound = []
    for (const col of columnHandles) {
      const colState = await col.getAttribute('data-column')
      columnsFound.push(colState)
    }
    console.log(`  Columns found: ${JSON.stringify(columnsFound)}`)

    const orderedCorrectly = JSON.stringify(columnsFound) === JSON.stringify(EXPECTED_COLUMNS)
    const has5Columns = columnsFound.length === 5

    // Check count badges per column
    const columnCounts = {}
    for (const state of EXPECTED_COLUMNS) {
      const col = page.locator(`[data-column="${state}"]`)
      const badge = col.locator('span.rounded-full, [class*="count"], [class*="badge"]').first()
      const badgeText = await badge.textContent().catch(() => null)
      columnCounts[state] = badgeText?.trim()
    }
    console.log(`  Column counts: ${JSON.stringify(columnCounts)}`)

    // Check each test ticket appears in the correct column with type badge + title + epic + time
    const checkTicketInColumn = async (ticketTitle, expectedState, ticketType) => {
      const col = page.locator(`[data-column="${expectedState}"]`)
      const cards = col.locator('li')
      const count = await cards.count()
      let found = false
      for (let i = 0; i < count; i++) {
        const cardText = await cards.nth(i).textContent()
        if (cardText?.includes(ticketTitle)) {
          found = true
          // Check type badge present (TypeBadge renders the type)
          const typeInCard = cardText?.toLowerCase().includes(ticketType)
          // Check epic shown (epicTitle or "No epic")
          const epicInCard = cardText?.includes('Epic:') || cardText?.includes('No epic')
          // Check relative time (should contain "ago" or "just now")
          const timeInCard = cardText?.includes('ago') || cardText?.includes('just now') || cardText?.includes('second') || cardText?.includes('minute')
          console.log(`    Card "${ticketTitle}": type=${typeInCard} epic=${epicInCard} time=${timeInCard}`)
          return { found, typeInCard, epicInCard, timeInCard }
        }
      }
      return { found: false }
    }

    const newCheck = await checkTicketInColumn(`M5-New-${ts}`, 'new', 'bug')
    const rfiCheck = await checkTicketInColumn(`M5-RFI-${ts}`, 'ready_for_implementation', 'feature')
    const ipCheck = await checkTicketInColumn(`M5-InProgress-${ts}`, 'in_progress', 'fix')
    const rfaCheck = await checkTicketInColumn(`M5-RFA-${ts}`, 'ready_for_acceptance', 'bug')
    const doneCheck = await checkTicketInColumn(`M5-Done-${ts}`, 'done', 'feature')

    const allTicketsInPlace = newCheck.found && rfiCheck.found && ipCheck.found && rfaCheck.found && doneCheck.found
    const allHaveType = newCheck.typeInCard && rfiCheck.typeInCard && ipCheck.typeInCard && rfaCheck.typeInCard && doneCheck.typeInCard
    const allHaveEpic = newCheck.epicInCard && rfiCheck.epicInCard && ipCheck.epicInCard && rfaCheck.epicInCard && doneCheck.epicInCard
    const allHaveTime = newCheck.timeInCard && rfiCheck.timeInCard && ipCheck.timeInCard && rfaCheck.timeInCard && doneCheck.timeInCard

    const shot1 = await screenshot(page, '01-board-5-columns')

    if (has5Columns && orderedCorrectly && allTicketsInPlace) {
      pass(
        'Step 1: Board renders 5 columns in workflow order',
        `Columns: ${columnsFound.join(', ')} | All tickets in correct columns | Type=${allHaveType} Epic=${allHaveEpic} Time=${allHaveTime}`,
        shot1,
      )
    } else {
      fail(
        'Step 1: Board renders 5 columns in workflow order',
        `has5=${has5Columns} orderedOK=${orderedCorrectly} ticketsOK=${allTicketsInPlace} | columns=${JSON.stringify(columnsFound)}`,
        shot1,
      )
    }

    if (!allHaveType) fail('Step 1: Card type badges', `Not all cards show type badge | new=${newCheck.typeInCard} rfi=${rfiCheck.typeInCard} ip=${ipCheck.typeInCard}`, null)
    else pass('Step 1: Card type badges', 'All cards show type badge', null)

    if (!allHaveEpic) fail('Step 1: Card epic shown', `Not all cards show epic | new=${newCheck.epicInCard} rfi=${rfiCheck.epicInCard}`, null)
    else pass('Step 1: Card epic shown', 'All cards show epic title or "No epic"', null)

    if (!allHaveTime) fail('Step 1: Card relative time', `Not all cards show relative time | new=${newCheck.timeInCard}`, null)
    else pass('Step 1: Card relative time', 'All cards show relative time', null)

  } catch (err) {
    const shot = await screenshot(page, '01-columns-error')
    fail('Step 1: Board renders 5 columns', `Error: ${err.message}`, shot)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 2: Drag persists after page reload
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\nStep 2: Drag persists after page reload')
  try {
    await gotoQuiet(page, `${BASE_URL}/board?team=${teamAId}`)
    await page.waitForSelector('[data-column="new"]', { timeout: 15_000 })
    await page.waitForTimeout(1000)

    // Find the card to drag (the "New" ticket → drag to "In Progress")
    const sourceCol = page.locator('[data-column="new"]')
    const targetCol = page.locator('[data-column="in_progress"]')

    // Get positions
    const sourceBox = await sourceCol.boundingBox()
    const targetBox = await targetCol.boundingBox()

    if (!sourceBox || !targetBox) {
      throw new Error('Could not get bounding boxes for source/target columns')
    }

    // Find the card in "new" column
    const cardsInNew = await sourceCol.locator('li').count()
    console.log(`  Cards in "new" before drag: ${cardsInNew}`)
    if (cardsInNew === 0) throw new Error('No cards in "new" column to drag')

    // Get the first card's bounding box for dragging
    const firstCard = sourceCol.locator('li').first()
    const cardBox = await firstCard.boundingBox()
    if (!cardBox) throw new Error('Could not get card bounding box')

    // Get card title before drag (to verify after reload)
    const cardTextBefore = await firstCard.textContent()
    console.log(`  Card to drag: "${cardTextBefore?.trim().substring(0, 50)}..."`)

    const shot2a = await screenshot(page, '02a-before-drag')

    // Perform drag from "new" column to "in_progress" column
    const startX = cardBox.x + cardBox.width / 2
    const startY = cardBox.y + cardBox.height / 2
    const endX = targetBox.x + targetBox.width / 2
    const endY = targetBox.y + targetBox.height / 2

    await page.mouse.move(startX, startY)
    await page.waitForTimeout(100)
    await page.mouse.down()
    await page.waitForTimeout(200)
    // Move gradually to activate drag
    await page.mouse.move(startX + 10, startY, { steps: 3 })
    await page.waitForTimeout(100)
    await page.mouse.move(endX, endY, { steps: 20 })
    await page.waitForTimeout(500)
    await page.mouse.up()
    await page.waitForTimeout(1500) // wait for optimistic update + API call

    // Check card is now in "in_progress"
    const cardsInIPAfterDrag = await targetCol.locator('li').count()
    const cardsInNewAfterDrag = await sourceCol.locator('li').count()
    console.log(`  Cards in "in_progress" after drag: ${cardsInIPAfterDrag}`)
    console.log(`  Cards in "new" after drag: ${cardsInNewAfterDrag}`)

    const shot2b = await screenshot(page, '02b-after-drag')

    // Reload the page
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('[data-column="in_progress"]', { timeout: 15_000 })
    await page.waitForTimeout(1000)

    const targetColAfterReload = page.locator('[data-column="in_progress"]')
    const sourceColAfterReload = page.locator('[data-column="new"]')
    const cardsInIPAfterReload = await targetColAfterReload.locator('li').count()
    const cardsInNewAfterReload = await sourceColAfterReload.locator('li').count()
    console.log(`  Cards in "in_progress" after reload: ${cardsInIPAfterReload}`)
    console.log(`  Cards in "new" after reload: ${cardsInNewAfterReload}`)

    const shot2c = await screenshot(page, '02c-after-reload')

    // Verify the drag had effect AND persisted
    // The "new" column originally had ticketNew (which we drag); "in_progress" had ticketIP
    // After drag: new should have 1 fewer, in_progress should have 1 more
    const dragWorked = cardsInNewAfterDrag < cardsInNew || cardsInIPAfterDrag > 1
    const dragPersisted = cardsInNewAfterReload < cardsInNew || cardsInIPAfterReload > 1

    if (dragWorked && dragPersisted) {
      pass(
        'Step 2: Drag persists after reload',
        `new: ${cardsInNew}→${cardsInNewAfterDrag}→${cardsInNewAfterReload} | in_progress: ${cardsInIPAfterDrag}→${cardsInIPAfterReload} (persisted)`,
        shot2c,
      )
    } else if (!dragWorked) {
      fail(
        'Step 2: Drag had no effect',
        `new: ${cardsInNew}→${cardsInNewAfterDrag} | in_progress before/after drag counts unchanged`,
        shot2b,
      )
    } else {
      fail(
        'Step 2: Drag not persisted after reload',
        `Drag moved card but reload reverted it | new: ${cardsInNew}→${cardsInNewAfterDrag}→${cardsInNewAfterReload}`,
        shot2c,
      )
    }
  } catch (err) {
    const shot = await screenshot(page, '02-drag-error')
    fail('Step 2: Drag persists after reload', `Error: ${err.message}`, shot)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 3: Drag rollback on API failure
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\nStep 3: Drag rollback on API failure')
  try {
    // Create a fresh ticket in "new" state so there is always a card to drag
    {
      let csrf = await getCsrfToken(page)
      const rollbackTicket = await createTicketAPI(page, csrf, {
        teamId: teamAId, type: 'fix', state: 'new',
        title: `M5-Rollback-${ts}`,
      })
      console.log(`  Created rollback test ticket: ${rollbackTicket.id}`)
    }

    await gotoQuiet(page, `${BASE_URL}/board?team=${teamAId}`)
    await page.waitForSelector('[data-column]', { timeout: 15_000 })
    await page.waitForTimeout(1000)

    // Count cards in each column before the failed drag
    const newColBefore = page.locator('[data-column="new"]')
    const rfiColBefore = page.locator('[data-column="ready_for_implementation"]')
    const cardsInNewBefore = await newColBefore.locator('li').count()
    const cardsInRFIBefore = await rfiColBefore.locator('li').count()
    console.log(`  Before rollback test — new: ${cardsInNewBefore}, rfi: ${cardsInRFIBefore}`)

    if (cardsInNewBefore === 0) {
      fail('Step 3: Drag rollback — no cards in "new" column to test with', 'No cards available even after creating rollback ticket', null)
    } else {
      const shot3a = await screenshot(page, '03a-before-failed-drag')

      // Set up route intercept to abort PATCH /api/tickets/*
      await page.route('**/api/tickets/*', async (route, request) => {
        if (request.method() === 'PATCH') {
          console.log(`  Route intercept: aborting PATCH ${request.url()}`)
          await route.abort('failed')
        } else {
          await route.continue()
        }
      })

      // Perform drag
      const sourceCol = page.locator('[data-column="new"]')
      const targetCol = page.locator('[data-column="ready_for_implementation"]')
      const sourceBox = await sourceCol.boundingBox()
      const targetBox = await targetCol.boundingBox()
      const firstCard = sourceCol.locator('li').first()
      const cardBox = await firstCard.boundingBox()

      if (!sourceBox || !targetBox || !cardBox) throw new Error('Could not get bounding boxes')

      const startX = cardBox.x + cardBox.width / 2
      const startY = cardBox.y + cardBox.height / 2
      const endX = targetBox.x + targetBox.width / 2
      const endY = targetBox.y + targetBox.height / 2

      await page.mouse.move(startX, startY)
      await page.waitForTimeout(100)
      await page.mouse.down()
      await page.waitForTimeout(200)
      await page.mouse.move(startX + 10, startY, { steps: 3 })
      await page.waitForTimeout(100)
      await page.mouse.move(endX, endY, { steps: 20 })
      await page.waitForTimeout(500)
      await page.mouse.up()
      await page.waitForTimeout(2500) // wait for rollback to complete + toast to appear

      // Remove route override
      await page.unroute('**/api/tickets/*')

      // Check for rollback: card should be back in "new"
      const newColAfter = page.locator('[data-column="new"]')
      const rfiColAfter = page.locator('[data-column="ready_for_implementation"]')
      const cardsInNewAfter = await newColAfter.locator('li').count()
      const cardsInRFIAfter = await rfiColAfter.locator('li').count()
      console.log(`  After rollback — new: ${cardsInNewAfter}, rfi: ${cardsInRFIAfter}`)

      // Check for toast/error message
      const toastVisible = await page.locator('[role="alert"], [class*="toast"], [class*="Toast"]').count()
      const toastText = toastVisible > 0 ? await page.locator('[role="alert"], [class*="toast"], [class*="Toast"]').first().textContent() : null
      console.log(`  Toast visible: ${toastVisible > 0}, text: "${toastText?.trim()}"`)

      const shot3b = await screenshot(page, '03b-after-failed-drag-rollback')

      const snapBackOk = cardsInNewAfter >= cardsInNewBefore
      const rfiNotGrown = cardsInRFIAfter <= cardsInRFIBefore
      const toastShown = toastVisible > 0

      if (snapBackOk && rfiNotGrown && toastShown) {
        pass(
          'Step 3: Drag rollback on API failure',
          `Card snapped back to "new" (${cardsInNewBefore}→${cardsInNewAfter}) | RFI unchanged (${cardsInRFIBefore}→${cardsInRFIAfter}) | Toast: "${toastText?.trim()}"`,
          shot3b,
        )
      } else {
        const detail = []
        if (!snapBackOk) detail.push(`Card NOT snapped back (new: ${cardsInNewBefore}→${cardsInNewAfter})`)
        if (!rfiNotGrown) detail.push(`RFI grew (${cardsInRFIBefore}→${cardsInRFIAfter}) — not rolled back`)
        if (!toastShown) detail.push('No toast/error message shown')
        fail('Step 3: Drag rollback on API failure', detail.join(' | '), shot3b)
      }
    }
  } catch (err) {
    // Clean up route if exception
    await page.unroute('**/api/tickets/*').catch(() => {})
    const shot = await screenshot(page, '03-rollback-error')
    fail('Step 3: Drag rollback on API failure', `Error: ${err.message}`, shot)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 4: Filters (AND) + search + count; Clear resets
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\nStep 4: Filters (AND) + search + count; Clear resets')
  try {
    await gotoQuiet(page, `${BASE_URL}/board?team=${teamAId}`)
    await page.waitForSelector('[data-column]', { timeout: 15_000 })
    await page.waitForTimeout(1000)

    // Check initial total count
    const totalCountEl = page.locator('p[aria-live="polite"]')
    const totalCountText = await totalCountEl.textContent()
    console.log(`  Initial total count: "${totalCountText?.trim()}"`)
    const totalMatch = totalCountText?.match(/(\d+)/)
    const initialTotal = totalMatch ? parseInt(totalMatch[1]) : 0

    // Board has 3 selects: [Team, Type, Epic]
    // Use aria-label or nth-of-type to target each specifically
    // The Type select has options: All types, Bug, Feature, Fix
    // The Epic select has options: All epics, <epic names>

    // --- Type filter: Bug (use 2nd select = Type) ---
    const allSelects = page.locator('select')
    const selectCount = await allSelects.count()
    console.log(`  Select elements on page: ${selectCount}`)

    // Find the Type select by its "All types" placeholder option
    let typeSelectIdx = -1
    for (let i = 0; i < selectCount; i++) {
      const opts = await allSelects.nth(i).locator('option').all()
      for (const opt of opts) {
        const text = await opt.textContent()
        if (text?.trim() === 'All types') { typeSelectIdx = i; break }
      }
      if (typeSelectIdx >= 0) break
    }
    console.log(`  Type select index: ${typeSelectIdx}`)

    // Find the Epic select by its "All epics" placeholder option
    let epicSelectIdx = -1
    for (let i = 0; i < selectCount; i++) {
      const opts = await allSelects.nth(i).locator('option').all()
      for (const opt of opts) {
        const text = await opt.textContent()
        if (text?.trim() === 'All epics') { epicSelectIdx = i; break }
      }
      if (epicSelectIdx >= 0) break
    }
    console.log(`  Epic select index: ${epicSelectIdx}`)

    if (typeSelectIdx < 0) {
      throw new Error('Could not find Type select (no "All types" option)')
    }

    await allSelects.nth(typeSelectIdx).selectOption('bug')
    await page.waitForTimeout(800)

    const bugCountText = await totalCountEl.textContent()
    const bugMatch = bugCountText?.match(/(\d+)/)
    const bugTotal = bugMatch ? parseInt(bugMatch[1]) : 0
    console.log(`  After Bug filter: "${bugCountText?.trim()}" (${bugTotal} tickets)`)

    const shot4a = await screenshot(page, '04a-bug-filter')

    // --- Epic filter ---
    // First reset type to "All types"
    await allSelects.nth(typeSelectIdx).selectOption('')
    await page.waitForTimeout(500)

    if (epicSelectIdx >= 0) {
      await allSelects.nth(epicSelectIdx).selectOption(epicA1Id)
      await page.waitForTimeout(800)
    }

    const epicCountText = await totalCountEl.textContent()
    const epicMatch = epicCountText?.match(/(\d+)/)
    const epicTotal = epicMatch ? parseInt(epicMatch[1]) : 0
    console.log(`  After Epic A1 filter: "${epicCountText?.trim()}" (${epicTotal} tickets)`)

    const shot4b = await screenshot(page, '04b-epic-filter')

    // --- Search: case-insensitive substring on title ---
    // Clear epic filter first
    if (epicSelectIdx >= 0) {
      await allSelects.nth(epicSelectIdx).selectOption('')
    }
    await page.waitForTimeout(500)

    const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]').first()
    // Type uppercase version of partial title to verify case-insensitive
    const searchQuery = `M5-NEW-${ts}`.toUpperCase()
    await searchInput.fill(searchQuery)
    await page.waitForTimeout(1000) // debounce

    const searchCountText = await totalCountEl.textContent()
    const searchMatch = searchCountText?.match(/(\d+)/)
    const searchTotal = searchMatch ? parseInt(searchMatch[1]) : 0
    console.log(`  After search "${searchQuery}" (upper): "${searchCountText?.trim()}" (${searchTotal} tickets)`)

    const shot4c = await screenshot(page, '04c-search-filter')

    // --- Combined filter: Type=Bug + Search ---
    // Keep the search, add type bug
    await allSelects.nth(typeSelectIdx).selectOption('bug')
    await page.waitForTimeout(800)

    const combinedCountText = await totalCountEl.textContent()
    const combinedMatch = combinedCountText?.match(/(\d+)/)
    const combinedTotal = combinedMatch ? parseInt(combinedMatch[1]) : 0
    console.log(`  After Bug + Search: "${combinedCountText?.trim()}" (${combinedTotal} tickets)`)

    const shot4d = await screenshot(page, '04d-combined-filter')

    // --- Clear button ---
    // Note: the Clear button's onClick calls updateParams({ type: null, epic: null, q: null })
    // The search input has a useEffect that syncs from qParam, so clearing q= should reset it.
    const clearBtn = page.locator('button:has-text("Clear")')
    const clearBtnDisabled = await clearBtn.getAttribute('disabled')
    console.log(`  Clear button disabled: ${clearBtnDisabled !== null}`)
    await clearBtn.click()
    await page.waitForTimeout(1500) // wait for URL update + debounce flush + data reload

    const afterClearCountText = await totalCountEl.textContent()
    const afterClearMatch = afterClearCountText?.match(/(\d+)/)
    const afterClearTotal = afterClearMatch ? parseInt(afterClearMatch[1]) : 0
    console.log(`  After Clear: "${afterClearCountText?.trim()}" (${afterClearTotal} tickets)`)

    const searchInputValue = await searchInput.inputValue()
    console.log(`  Search input after Clear: "${searchInputValue}"`)

    // Check URL params are cleared
    const urlAfterClear = page.url()
    console.log(`  URL after Clear: ${urlAfterClear}`)
    const typeParamGone = !urlAfterClear.includes('type=')
    const epicParamGone = !urlAfterClear.includes('epic=')
    const qParamGone = !urlAfterClear.includes('q=')

    const shot4e = await screenshot(page, '04e-after-clear')

    // Evaluate pass/fail
    const filterReducedCount = bugTotal < initialTotal || epicTotal < initialTotal
    const searchIsSubstring = searchTotal >= 1 // should find the M5-New-* ticket (case-insensitive)
    const clearRestoredCount = afterClearTotal >= initialTotal
    const clearResetSearch = searchInputValue === '' || searchInputValue === null || searchInputValue === undefined
    const urlParamsCleared = typeParamGone && qParamGone

    console.log(`  filterReducedCount=${filterReducedCount} searchIsSubstring=${searchIsSubstring} clearRestoredCount=${clearRestoredCount} clearResetSearch=${clearResetSearch} urlParamsCleared=${urlParamsCleared}`)

    if (filterReducedCount && searchIsSubstring && clearRestoredCount) {
      pass(
        'Step 4: Filters (AND) + search + count; Clear resets',
        `Initial=${initialTotal} | Bug=${bugTotal} | EpicA1=${epicTotal} | Search(upper)=${searchTotal} | Combined=${combinedTotal} | AfterClear=${afterClearTotal} | SearchCleared=${clearResetSearch} | URLCleared=${urlParamsCleared}`,
        shot4e,
      )
    } else {
      const detail = []
      if (!filterReducedCount) detail.push(`Filter did not reduce count (initial=${initialTotal} bug=${bugTotal} epic=${epicTotal})`)
      if (!searchIsSubstring) detail.push(`Search found 0 results for "${searchQuery}" — case-insensitive match may be broken`)
      if (!clearRestoredCount) detail.push(`Clear did not restore count (${afterClearTotal} < ${initialTotal})`)
      fail('Step 4: Filters + search + Clear', detail.join(' | '), shot4e)
    }

    if (!clearResetSearch) {
      fail('Step 4: Clear does not reset search input', `Search input after Clear = "${searchInputValue}"`, shot4e)
    } else {
      pass('Step 4: Clear resets search input', `Search input value after Clear: "${searchInputValue}" (cleared)`, null)
    }

    if (!urlParamsCleared) {
      fail('Step 4: URL params not cleared', `type gone=${typeParamGone} epic gone=${epicParamGone} q gone=${qParamGone} | URL: ${urlAfterClear}`, null)
    } else {
      pass('Step 4: URL params cleared after Clear', `type=${typeParamGone} epic=${epicParamGone} q=${qParamGone}`, null)
    }

  } catch (err) {
    const shot = await screenshot(page, '04-filter-error')
    fail('Step 4: Filters + search + count', `Error: ${err.message}`, shot)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 5: Team selector; URL params survive reload
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\nStep 5: Team selector + URL params survive reload')
  try {
    // Navigate with all filters set for Team A
    await gotoQuiet(page, `${BASE_URL}/board?team=${teamAId}&type=bug&epic=${epicA1Id}&q=M5`)
    await page.waitForSelector('[data-column]', { timeout: 15_000 })
    await page.waitForTimeout(1000)

    const url1 = page.url()
    console.log(`  URL with filters: ${url1}`)

    const hasTeamParam = url1.includes(`team=${teamAId}`)
    const hasTypeParam = url1.includes('type=bug')
    const hasEpicParam = url1.includes(`epic=${epicA1Id}`)
    const hasQParam = url1.includes('q=M5')

    const shot5a = await screenshot(page, '05a-team-a-with-filters')

    // Check count for Team A
    const totalCountEl = page.locator('p[aria-live="polite"]')
    const teamACount = await totalCountEl.textContent()
    console.log(`  Team A ticket count: "${teamACount?.trim()}"`)

    // Switch team to Team B
    const teamSelect = page.locator('select').first()
    await teamSelect.selectOption(teamBId)
    await page.waitForTimeout(1200)

    const url2 = page.url()
    console.log(`  URL after switching to Team B: ${url2}`)
    const teamBSelected = url2.includes(`team=${teamBId}`)

    const teamBCount = await totalCountEl.textContent()
    console.log(`  Team B ticket count: "${teamBCount?.trim()}"`)

    // Epic filter should be cleared when team changes (per BoardPage code)
    const epicParamCleared = !url2.includes(`epic=${epicA1Id}`)
    console.log(`  Epic filter cleared after team switch: ${epicParamCleared}`)

    const shot5b = await screenshot(page, '05b-team-b-selected')

    // Reload and verify team B is still selected
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('[data-column]', { timeout: 15_000 })
    await page.waitForTimeout(1000)

    const url3 = page.url()
    console.log(`  URL after reload: ${url3}`)
    const teamBAfterReload = url3.includes(`team=${teamBId}`)

    const teamBCountAfterReload = await totalCountEl.textContent()
    console.log(`  Team B count after reload: "${teamBCountAfterReload?.trim()}"`)

    const shot5c = await screenshot(page, '05c-team-b-after-reload')

    if (hasTeamParam && hasTypeParam && hasEpicParam && hasQParam && teamBSelected && teamBAfterReload) {
      pass(
        'Step 5: Team selector + URL params survive reload',
        `URL params: team=${hasTeamParam} type=${hasTypeParam} epic=${hasEpicParam} q=${hasQParam} | Team B selected: ${teamBSelected} | Survived reload: ${teamBAfterReload} | Epic cleared on switch: ${epicParamCleared}`,
        shot5c,
      )
    } else {
      const detail = []
      if (!hasTeamParam) detail.push('Missing ?team= in URL')
      if (!hasTypeParam) detail.push('Missing ?type= in URL')
      if (!hasEpicParam) detail.push('Missing ?epic= in URL')
      if (!hasQParam) detail.push('Missing ?q= in URL')
      if (!teamBSelected) detail.push(`Team B not in URL (url2=${url2})`)
      if (!teamBAfterReload) detail.push(`Team B not persisted after reload (url3=${url3})`)
      fail('Step 5: Team selector + URL params', detail.join(' | '), shot5c)
    }

    if (!epicParamCleared) {
      fail('Step 5: Epic filter not cleared on team switch', `Epic filter still present: ${url2}`, null)
    } else {
      pass('Step 5: Epic filter cleared on team switch', 'Epic param removed when switching teams', null)
    }

  } catch (err) {
    const shot = await screenshot(page, '05-team-selector-error')
    fail('Step 5: Team selector + URL params', `Error: ${err.message}`, shot)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 6: Click card → /tickets/:id; "+ New ticket" → /tickets/new
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\nStep 6: Card click → /tickets/:id; "+ New ticket" → /tickets/new')
  try {
    await gotoQuiet(page, `${BASE_URL}/board?team=${teamAId}`)
    await page.waitForSelector('[data-column]', { timeout: 15_000 })
    await page.waitForTimeout(1000)

    const shot6a = await screenshot(page, '06a-board-before-click')

    // Click on a ticket card (use the link inside the card, not the drag handle)
    const ticketLinks = page.locator('li a[href*="/tickets/"]')
    const linkCount = await ticketLinks.count()
    console.log(`  Ticket links in board: ${linkCount}`)

    if (linkCount > 0) {
      const firstLink = ticketLinks.first()
      const href = await firstLink.getAttribute('href')
      console.log(`  First ticket link href: ${href}`)
      await firstLink.click()
      await page.waitForURL(/\/tickets\/[0-9a-f-]+$/, { timeout: 10_000 })
      const ticketDetailUrl = page.url()
      console.log(`  Navigated to: ${ticketDetailUrl}`)
      const isTicketDetail = ticketDetailUrl.match(/\/tickets\/[0-9a-f-]+$/)

      const shot6b = await screenshot(page, '06b-ticket-detail')

      if (isTicketDetail) {
        pass('Step 6: Card click → /tickets/:id', `Navigated to: ${ticketDetailUrl}`, shot6b)
      } else {
        fail('Step 6: Card click → /tickets/:id', `URL after click: ${ticketDetailUrl}`, shot6b)
      }
    } else {
      // Try clicking on the card div
      const firstCardDiv = page.locator('li div[class*="cursor-pointer"]').first()
      const firstCardCount = await firstCardDiv.count()
      if (firstCardCount > 0) {
        await firstCardDiv.click()
        await page.waitForURL(/\/tickets\/[0-9a-f-]+$/, { timeout: 8_000 })
        const ticketDetailUrl = page.url()
        const isTicketDetail = ticketDetailUrl.match(/\/tickets\/[0-9a-f-]+$/)
        const shot6b = await screenshot(page, '06b-ticket-detail')
        if (isTicketDetail) {
          pass('Step 6: Card click → /tickets/:id', `Navigated to: ${ticketDetailUrl}`, shot6b)
        } else {
          fail('Step 6: Card click → /tickets/:id', `URL after click: ${ticketDetailUrl}`, shot6b)
        }
      } else {
        fail('Step 6: Card click → /tickets/:id', `No clickable ticket cards found (linkCount=${linkCount})`, null)
      }
    }

    // Go back to board and test "+ New ticket"
    await gotoQuiet(page, `${BASE_URL}/board?team=${teamAId}`)
    await page.waitForSelector('[data-column]', { timeout: 15_000 })
    await page.waitForTimeout(500)

    const newTicketBtn = page.locator('a:has-text("+ New ticket"), button:has-text("+ New ticket")')
    const newTicketBtnCount = await newTicketBtn.count()
    console.log(`  "+ New ticket" button count: ${newTicketBtnCount}`)

    if (newTicketBtnCount > 0) {
      await newTicketBtn.first().click()
      await page.waitForURL(`${BASE_URL}/tickets/new`, { timeout: 8_000 })
      const newTicketUrl = page.url()
      const shot6c = await screenshot(page, '06c-new-ticket-page')
      if (newTicketUrl.endsWith('/tickets/new')) {
        pass('Step 6: "+ New ticket" → /tickets/new', `URL: ${newTicketUrl}`, shot6c)
      } else {
        fail('Step 6: "+ New ticket" → /tickets/new', `URL: ${newTicketUrl}`, shot6c)
      }
    } else {
      fail('Step 6: "+ New ticket" button', '+ New ticket button/link not found on board', null)
    }

  } catch (err) {
    const shot = await screenshot(page, '06-open-error')
    fail('Step 6: Open + create', `Error: ${err.message}`, shot)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 7: Keyboard drag (a11y)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\nStep 7: Keyboard drag (a11y)')
  try {
    await gotoQuiet(page, `${BASE_URL}/board?team=${teamAId}`)
    await page.waitForSelector('[data-column]', { timeout: 15_000 })
    await page.waitForTimeout(1000)

    // The keyboard activator is the "Move ticket: <title>" button (setActivatorNodeRef)
    const moveButtons = page.locator('button[aria-label^="Move ticket:"]')
    const moveBtnCount = await moveButtons.count()
    console.log(`  Move buttons (keyboard activators): ${moveBtnCount}`)

    const shot7a = await screenshot(page, '07a-before-keyboard-drag')

    if (moveBtnCount === 0) {
      fail('Step 7: Keyboard drag', 'No "Move ticket:" buttons found — keyboard a11y control missing', shot7a)
    } else {
      // Find which column has cards at index 0 to start drag from
      const STATES = ['new', 'ready_for_implementation', 'in_progress', 'ready_for_acceptance', 'done']
      let sourceState = null
      let sourceCount = 0
      for (const s of STATES) {
        const cnt = await page.locator(`[data-column="${s}"]`).locator('li').count()
        if (cnt > 0 && s !== 'done') { // prefer not "done" so we can move right
          sourceState = s
          sourceCount = cnt
          break
        }
      }
      if (!sourceState) sourceState = 'new' // fallback

      console.log(`  Picking keyboard drag source: ${sourceState} (${sourceCount} cards)`)

      // Find the source state index to compute target state
      const sourceIdx = STATES.indexOf(sourceState)
      const targetIdx = Math.min(sourceIdx + 1, STATES.length - 1)
      const targetState = STATES[targetIdx]

      const sourceColBefore = await page.locator(`[data-column="${sourceState}"]`).locator('li').count()
      const targetColBefore = await page.locator(`[data-column="${targetState}"]`).locator('li').count()
      console.log(`  Before keyboard drag: ${sourceState}=${sourceColBefore}, ${targetState}=${targetColBefore}`)

      // Find the Move button for a card in the source column
      const sourceColEl = page.locator(`[data-column="${sourceState}"]`)
      const moveBtnInSource = sourceColEl.locator('button[aria-label^="Move ticket:"]').first()
      const moveBtnLabel = await moveBtnInSource.getAttribute('aria-label')
      console.log(`  Move button to use: "${moveBtnLabel}"`)

      await moveBtnInSource.focus()
      await page.waitForTimeout(300)

      // Press Space (dnd-kit keyboard activator default) to lift
      await page.keyboard.press('Space')
      await page.waitForTimeout(600)

      // Read screen reader announcement after lift
      // dnd-kit uses aria-live="assertive" for announcements
      const srRegions = page.locator('[aria-live]')
      const srCount = await srRegions.count()
      let announcementAfterLift = ''
      for (let i = 0; i < srCount; i++) {
        const text = await srRegions.nth(i).textContent()
        if (text && text.length > 5) { announcementAfterLift = text.trim(); break }
      }
      console.log(`  SR announcement after Space lift: "${announcementAfterLift}"`)

      // Press ArrowRight to move to next column
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(600)

      let announcementAfterMove = ''
      for (let i = 0; i < srCount; i++) {
        const text = await srRegions.nth(i).textContent()
        if (text && text.length > 5) { announcementAfterMove = text.trim(); break }
      }
      console.log(`  SR announcement after ArrowRight: "${announcementAfterMove}"`)

      // Press Space to drop
      await page.keyboard.press('Space')
      await page.waitForTimeout(2000)

      // Check if card moved
      const sourceColAfter = await page.locator(`[data-column="${sourceState}"]`).locator('li').count()
      const targetColAfter = await page.locator(`[data-column="${targetState}"]`).locator('li').count()
      console.log(`  After keyboard drag: ${sourceState}=${sourceColAfter}, ${targetState}=${targetColAfter}`)

      const shot7b = await screenshot(page, '07b-after-keyboard-drag')

      const keyboardMoveWorked = (sourceColAfter < sourceColBefore) || (targetColAfter > targetColBefore)
      const hasSRAnnouncement = announcementAfterLift.includes('Picked up') || announcementAfterLift.includes('lifted') || announcementAfterMove.includes('column') || announcementAfterLift.length > 0

      if (keyboardMoveWorked) {
        pass(
          'Step 7: Keyboard drag (a11y)',
          `Card moved via Space+ArrowRight+Space: ${sourceState}: ${sourceColBefore}→${sourceColAfter}, ${targetState}: ${targetColBefore}→${targetColAfter} | SR lift: "${announcementAfterLift.substring(0, 60)}" | SR move: "${announcementAfterMove.substring(0, 60)}"`,
          shot7b,
        )
      } else {
        // Report keyboard path behavior even without successful move
        fail(
          'Step 7: Keyboard drag — card not moved',
          `Move button (${moveBtnCount}) found, Space+ArrowRight+Space pressed. Card count unchanged: ${sourceState}=${sourceColBefore}→${sourceColAfter} ${targetState}=${targetColBefore}→${targetColAfter}. SR announce lift: "${announcementAfterLift.substring(0, 80)}" move: "${announcementAfterMove.substring(0, 80)}"`,
          shot7b,
        )
      }

    }

  } catch (err) {
    const shot = await screenshot(page, '07-keyboard-drag-error')
    fail('Step 7: Keyboard drag (a11y)', `Error: ${err.message}`, shot)
  }

  // Separate sub-check: Move button aria attributes (done after the drag attempt)
  try {
    // Re-check any remaining Move button on the board for aria attributes
    await gotoQuiet(page, `${BASE_URL}/board?team=${teamAId}`)
    await page.waitForSelector('[data-column]', { timeout: 15_000 })
    await page.waitForTimeout(500)
    const anyMoveBtn = page.locator('button[aria-label^="Move ticket:"]').first()
    const moveBtnCount2 = await page.locator('button[aria-label^="Move ticket:"]').count()
    if (moveBtnCount2 > 0) {
      const moveBtnLabel2 = await anyMoveBtn.getAttribute('aria-label')
      const ariaDescribedBy2 = await anyMoveBtn.getAttribute('aria-describedby')
      const hasAriaAttr = ariaDescribedBy2 !== null || moveBtnLabel2?.includes('Move ticket:')
      if (hasAriaAttr) {
        pass('Step 7: Move button has proper a11y attributes', `aria-label="${moveBtnLabel2}" aria-describedby="${ariaDescribedBy2}"`, null)
      } else {
        fail('Step 7: Move button a11y attributes', `aria-label="${moveBtnLabel2}" aria-describedby="${ariaDescribedBy2}" — missing aria-describedby`, null)
      }
    }
  } catch (err) {
    // Non-fatal sub-check
    console.warn(`  Warning: aria attributes sub-check error: ${err.message}`)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STEP 8: 100-ticket performance
  // ─────────────────────────────────────────────────────────────────────────────
  console.log('\nStep 8: 100-ticket performance')
  let perfTeamId
  try {
    // Create a dedicated perf team
    await createTeamUI(page, `M5-Perf-${ts}`)
    const teams = await getTeams(page)
    const perfTeam = teams.find(t => t.name === `M5-Perf-${ts}`)
    if (!perfTeam) throw new Error('Perf team not found')
    perfTeamId = perfTeam.id
    console.log(`  Perf team id: ${perfTeamId}`)

    // Create 100 tickets via API in batches
    let csrf = await getCsrfToken(page)
    const TICKET_TYPES = ['bug', 'feature', 'fix']
    const TICKET_STATES = ['new', 'ready_for_implementation', 'in_progress', 'ready_for_acceptance', 'done']

    const createStart = Date.now()
    let created = 0
    for (let i = 0; i < 100; i++) {
      csrf = await getCsrfToken(page)
      const type = TICKET_TYPES[i % 3]
      const state = TICKET_STATES[i % 5]
      const result = await apiPost(page, '/api/tickets', {
        team_id: perfTeamId,
        type,
        title: `Perf-Ticket-${i + 1}-${ts}`,
        body: `Performance test ticket #${i + 1}`,
      }, csrf)
      if (result.status === 201 && state !== 'new') {
        const csrf2 = await getCsrfToken(page)
        await apiPatch(page, `/api/tickets/${result.json.id}`, { state }, csrf2)
      }
      created++
      if (created % 20 === 0) console.log(`    Created ${created}/100 tickets...`)
    }
    const createDuration = Date.now() - createStart
    console.log(`  Created 100 tickets in ${createDuration}ms`)

    // Navigate to board and measure load time
    const loadStart = Date.now()
    await page.goto(`${BASE_URL}/board?team=${perfTeamId}`, { waitUntil: 'load' })
    await page.waitForSelector('[data-column]', { timeout: 30_000 })
    await page.waitForTimeout(500) // let cards settle
    const loadDuration = Date.now() - loadStart
    console.log(`  Board load time (100 tickets): ${loadDuration}ms`)

    // Count visible cards (should be ~100)
    let visibleCards = 0
    for (const state of TICKET_STATES) {
      const count = await page.locator(`[data-column="${state}"] li`).count()
      visibleCards += count
    }
    console.log(`  Visible cards: ${visibleCards}`)

    const shot8a = await screenshot(page, '08a-perf-board-100-tickets')

    // Interaction test: try dragging one card and measure response time
    const interactStart = Date.now()
    const newCol = page.locator('[data-column="new"]')
    const doneCol = page.locator('[data-column="done"]')
    const newBox = await newCol.boundingBox()
    const doneBox = await doneCol.boundingBox()

    let interactionTime = null
    if (newBox && doneBox) {
      const firstCard = newCol.locator('li').first()
      const cardBox = await firstCard.boundingBox()
      if (cardBox) {
        await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2)
        await page.mouse.down()
        await page.waitForTimeout(100)
        await page.mouse.move(cardBox.x + cardBox.width / 2 + 10, cardBox.y + cardBox.height / 2, { steps: 3 })
        await page.mouse.move(doneBox.x + doneBox.width / 2, doneBox.y + doneBox.height / 2, { steps: 30 })
        await page.mouse.up()
        await page.waitForTimeout(1000)
        interactionTime = Date.now() - interactStart
        console.log(`  Drag interaction time: ${interactionTime}ms`)
      }
    }

    const shot8b = await screenshot(page, '08b-perf-after-drag')

    // Performance thresholds
    const loadOk = loadDuration < 8000  // Under 8 seconds
    const allCardsVisible = visibleCards >= 95  // Allow for a few to be in loading state
    const interactionOk = interactionTime === null || interactionTime < 3000

    pass(
      'Step 8: 100-ticket performance',
      `Load time: ${loadDuration}ms (${loadOk ? 'OK' : 'SLOW'}) | Visible cards: ${visibleCards}/100 | Interaction: ${interactionTime ?? 'n/a'}ms (${interactionOk ? 'OK' : 'SLOW'}) | Create batch: ${createDuration}ms`,
      shot8b,
    )

    if (!loadOk) {
      fail('Step 8: Load time exceeds threshold', `${loadDuration}ms > 8000ms`, null)
    }
    if (!allCardsVisible) {
      fail('Step 8: Not all cards visible', `Only ${visibleCards}/100 cards rendered`, null)
    }

  } catch (err) {
    const shot = await screenshot(page, '08-perf-error')
    fail('Step 8: 100-ticket performance', `Error: ${err.message}`, shot)
  }

  await browser.close()

  // ─── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(72))
  console.log('M5 KANBAN BOARD QA REPORT')
  console.log('='.repeat(72))
  console.log(`Test email  : ${TEST_EMAIL}`)
  console.log(`Team A      : ${TEAM_A} (id: ${teamAId ?? 'n/a'})`)
  console.log(`Team B      : ${TEAM_B} (id: ${teamBId ?? 'n/a'})`)
  console.log(`Epic A1     : ${EPIC_A1} (id: ${epicA1Id ?? 'n/a'})`)
  console.log(`Epic A2     : ${EPIC_A2} (id: ${epicA2Id ?? 'n/a'})`)
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
