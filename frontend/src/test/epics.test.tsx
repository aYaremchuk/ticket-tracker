/**
 * Epics screen — integration tests.
 *
 * Covered:
 * - useEpics renders the epic list from the API for the selected team.
 * - Create success → panel closes, query is invalidated (list refreshes).
 * - Create 422 blank title → inline error shown in the panel.
 * - Delete button disabled when ticket_count > 0.
 * - Delete success → panel closes, list refreshes.
 * - Delete 409 epic_has_tickets → inline error shown in confirmation panel.
 *
 * Strategy: mock api/epics and api/teams modules; render EpicsPage inside a
 * real QueryClientProvider + MemoryRouter (with ?team= param set) so hooks
 * and UI interact naturally.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import { ApiError } from '../api/client.ts'
import * as epicsApi from '../api/epics.ts'
import * as teamsApi from '../api/teams.ts'
import { EpicsPage } from '../pages/EpicsPage.tsx'
import authReducer from '../store/authSlice.ts'
import type { Epic, Team } from '../types/api.ts'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEAM_A: Team = {
  id: 'team-a',
  name: 'Alpha Team',
  ticket_count: 3,
  epic_count: 2,
  created_at: '2026-06-01T10:00:00Z',
  modified_at: '2026-07-05T08:30:00Z',
}

const EPIC_WITH_TICKETS: Epic = {
  id: 'epic-1',
  team_id: 'team-a',
  title: 'Checkout Reliability',
  description: 'Fix checkout flow',
  ticket_count: 3,
  created_at: '2026-06-10T10:00:00Z',
  modified_at: '2026-07-01T09:00:00Z',
}

const EPIC_NO_TICKETS: Epic = {
  id: 'epic-2',
  team_id: 'team-a',
  title: 'Dark Mode',
  description: null,
  ticket_count: 0,
  created_at: '2026-06-15T12:00:00Z',
  modified_at: '2026-06-20T14:00:00Z',
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function makeStore() {
  return configureStore({ reducer: { auth: authReducer } })
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

/** Renders EpicsPage with ?team=team-a pre-selected in the URL. */
function renderEpicsPage(initialSearch = '?team=team-a') {
  const store = makeStore()
  const qc = makeQueryClient()

  const utils = render(
    <Provider store={store}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[`/epics${initialSearch}`]}>
          <EpicsPage />
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  )

  return { ...utils, qc }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EpicsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // Default: one team loaded
    vi.spyOn(teamsApi, 'listTeams').mockResolvedValue([TEAM_A])
  })

  // -------------------------------------------------------------------------
  it('renders the epic list returned by the API', async () => {
    vi.spyOn(epicsApi, 'listEpics').mockResolvedValue([
      EPIC_WITH_TICKETS,
      EPIC_NO_TICKETS,
    ])

    renderEpicsPage()

    // Loading spinner should appear first.
    expect(screen.getByRole('status', { name: /loading epics/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Checkout Reliability')).toBeInTheDocument()
    })

    expect(screen.getByText('Dark Mode')).toBeInTheDocument()

    // Description shown when present
    expect(screen.getByText('Fix checkout flow')).toBeInTheDocument()

    // Ticket counts rendered
    const rows = screen.getAllByRole('row')
    // rows[0] = header, rows[1] = epic-1, rows[2] = epic-2
    expect(within(rows[1]).getByText('3')).toBeInTheDocument()
    expect(within(rows[2]).getByText('0')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  it('renders empty state when team has no epics', async () => {
    vi.spyOn(epicsApi, 'listEpics').mockResolvedValue([])

    renderEpicsPage()

    await waitFor(() => {
      expect(screen.getByText(/no epics for this team/i)).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  it('renders error state when the API fails', async () => {
    vi.spyOn(epicsApi, 'listEpics').mockRejectedValue(
      new ApiError('server_error', 'Internal server error', 500),
    )

    renderEpicsPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Internal server error')
    })
  })

  // -------------------------------------------------------------------------
  it('create success → closes panel and invalidates the list', async () => {
    const newEpic: Epic = {
      ...EPIC_NO_TICKETS,
      id: 'epic-new',
      title: 'New Epic',
    }

    const listSpy = vi
      .spyOn(epicsApi, 'listEpics')
      .mockResolvedValueOnce([EPIC_NO_TICKETS])
      .mockResolvedValueOnce([EPIC_NO_TICKETS, newEpic])

    vi.spyOn(epicsApi, 'createEpic').mockResolvedValue(newEpic)

    renderEpicsPage()

    await waitFor(() => {
      expect(screen.getByText('Dark Mode')).toBeInTheDocument()
    })

    // Open create panel
    await userEvent.click(screen.getByRole('button', { name: /\+ create epic/i }))
    expect(screen.getByRole('heading', { name: /create epic/i })).toBeInTheDocument()

    // Fill and submit
    await userEvent.type(screen.getByLabelText('Title'), 'New Epic')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    // Panel should disappear (heading gone)
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: /create epic/i })).not.toBeInTheDocument()
    })

    // List should refresh
    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledTimes(2)
    })
  })

  // -------------------------------------------------------------------------
  it('create 422 blank title → shows inline error, panel stays open', async () => {
    vi.spyOn(epicsApi, 'listEpics').mockResolvedValue([EPIC_NO_TICKETS])
    vi.spyOn(epicsApi, 'createEpic').mockRejectedValue(
      new ApiError('validation_error', "Title can't be blank", 422, {
        title: ["can't be blank"],
      }),
    )

    renderEpicsPage()

    await waitFor(() => {
      expect(screen.getByText('Dark Mode')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /\+ create epic/i }))
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    // Inline error shown
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent("Title can't be blank")
    })

    // Panel still visible
    expect(screen.getByRole('heading', { name: /create epic/i })).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  it('Delete (×) button is disabled when ticket_count > 0', async () => {
    vi.spyOn(epicsApi, 'listEpics').mockResolvedValue([EPIC_WITH_TICKETS])

    renderEpicsPage()

    await waitFor(() => {
      expect(screen.getByText('Checkout Reliability')).toBeInTheDocument()
    })

    const deleteButton = screen.getByRole('button', {
      name: /delete checkout reliability/i,
    })
    expect(deleteButton).toBeDisabled()
  })

  // -------------------------------------------------------------------------
  it('Delete (×) button is enabled when ticket_count = 0', async () => {
    vi.spyOn(epicsApi, 'listEpics').mockResolvedValue([EPIC_NO_TICKETS])

    renderEpicsPage()

    await waitFor(() => {
      expect(screen.getByText('Dark Mode')).toBeInTheDocument()
    })

    const deleteButton = screen.getByRole('button', { name: /delete dark mode/i })
    expect(deleteButton).toBeEnabled()
  })

  // -------------------------------------------------------------------------
  it('delete success → closes panel and refreshes the list', async () => {
    const listSpy = vi
      .spyOn(epicsApi, 'listEpics')
      .mockResolvedValueOnce([EPIC_NO_TICKETS])
      .mockResolvedValueOnce([])

    vi.spyOn(epicsApi, 'deleteEpic').mockResolvedValue(undefined)

    renderEpicsPage()

    await waitFor(() => {
      expect(screen.getByText('Dark Mode')).toBeInTheDocument()
    })

    // Click × to open confirmation panel
    await userEvent.click(
      screen.getByRole('button', { name: /delete dark mode/i }),
    )
    expect(
      screen.getByRole('heading', { name: /delete epic/i }),
    ).toBeInTheDocument()

    // Confirm deletion
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    // Panel closes
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /delete epic/i }),
      ).not.toBeInTheDocument()
    })

    // List refreshes
    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledTimes(2)
    })
  })

  // -------------------------------------------------------------------------
  it('delete 409 epic_has_tickets → shows error in confirmation panel', async () => {
    vi.spyOn(epicsApi, 'listEpics').mockResolvedValue([EPIC_NO_TICKETS])
    vi.spyOn(epicsApi, 'deleteEpic').mockRejectedValue(
      new ApiError('epic_has_tickets', 'Epic has tickets', 409),
    )

    renderEpicsPage()

    await waitFor(() => {
      expect(screen.getByText('Dark Mode')).toBeInTheDocument()
    })

    await userEvent.click(
      screen.getByRole('button', { name: /delete dark mode/i }),
    )
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'This epic cannot be deleted while tickets reference it.',
      )
    })
  })
})
