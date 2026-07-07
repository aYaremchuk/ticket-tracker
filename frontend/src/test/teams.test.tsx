/**
 * Teams screen — integration tests.
 *
 * Covered:
 * - useTeams renders the team list from the API.
 * - Create success → modal closes, query is invalidated (list refreshes).
 * - Create 409 duplicate → inline error message shown in the modal.
 * - Delete disabled when ticket_count + epic_count > 0.
 * - Delete success → modal closes, list refreshes.
 *
 * Strategy: mock the api/teams module; render TeamsPage inside a real
 * QueryClientProvider + MemoryRouter so hooks and UI interact naturally.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import { ApiError } from '../api/client.ts'
import * as teamsApi from '../api/teams.ts'
import { TeamsPage } from '../pages/TeamsPage.tsx'
import authReducer from '../store/authSlice.ts'
import type { Team } from '../types/api.ts'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEAM_A: Team = {
  id: 'team-a',
  name: 'Alpha Team',
  ticket_count: 3,
  epic_count: 1,
  created_at: '2026-06-01T10:00:00Z',
  modified_at: '2026-07-05T08:30:00Z',
}

const TEAM_B: Team = {
  id: 'team-b',
  name: 'Beta Team',
  ticket_count: 0,
  epic_count: 0,
  created_at: '2026-06-15T12:00:00Z',
  modified_at: '2026-06-15T12:00:00Z',
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

function makeStore() {
  return configureStore({ reducer: { auth: authReducer } })
}

function makeQueryClient() {
  // Disable retries in tests so failures resolve quickly.
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function renderTeamsPage() {
  const store = makeStore()
  const qc = makeQueryClient()

  const utils = render(
    <Provider store={store}>
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <TeamsPage />
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  )

  return { ...utils, qc }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TeamsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  it('renders the team list returned by the API', async () => {
    vi.spyOn(teamsApi, 'listTeams').mockResolvedValue([TEAM_A, TEAM_B])

    renderTeamsPage()

    // Loading spinner should appear first.
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Alpha Team')).toBeInTheDocument()
    })

    expect(screen.getByText('Beta Team')).toBeInTheDocument()

    // Check ticket/epic counts are rendered.
    const rows = screen.getAllByRole('row')
    // rows[0] = header, rows[1] = Alpha Team, rows[2] = Beta Team
    expect(within(rows[1]).getByText('3')).toBeInTheDocument() // ticket_count
    expect(within(rows[1]).getByText('1')).toBeInTheDocument() // epic_count
  })

  // -------------------------------------------------------------------------
  it('renders empty state when no teams exist', async () => {
    vi.spyOn(teamsApi, 'listTeams').mockResolvedValue([])

    renderTeamsPage()

    await waitFor(() => {
      expect(screen.getByText(/no teams yet/i)).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  it('renders error state when the API fails', async () => {
    vi.spyOn(teamsApi, 'listTeams').mockRejectedValue(
      new ApiError('server_error', 'Internal server error', 500),
    )

    renderTeamsPage()

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Internal server error')
    })
  })

  // -------------------------------------------------------------------------
  it('create success → closes modal and refreshes list', async () => {
    const newTeam: Team = {
      ...TEAM_B,
      id: 'team-new',
      name: 'New Team',
    }

    const listSpy = vi
      .spyOn(teamsApi, 'listTeams')
      .mockResolvedValueOnce([TEAM_A])          // initial load
      .mockResolvedValueOnce([TEAM_A, newTeam]) // after invalidation

    vi.spyOn(teamsApi, 'createTeam').mockResolvedValue(newTeam)

    renderTeamsPage()

    // Wait for initial list to render.
    await waitFor(() => {
      expect(screen.getByText('Alpha Team')).toBeInTheDocument()
    })

    // Open create modal.
    await userEvent.click(screen.getByRole('button', { name: /create team/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Fill name and submit.
    await userEvent.type(screen.getByLabelText('Team name'), 'New Team')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    // Modal should close.
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // List should refresh (listTeams called a second time for invalidation).
    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledTimes(2)
    })
  })

  // -------------------------------------------------------------------------
  it('create 409 duplicate → shows inline error, modal stays open', async () => {
    vi.spyOn(teamsApi, 'listTeams').mockResolvedValue([TEAM_A])
    vi.spyOn(teamsApi, 'createTeam').mockRejectedValue(
      new ApiError('team_duplicate', 'Name already taken', 409),
    )

    renderTeamsPage()

    await waitFor(() => {
      expect(screen.getByText('Alpha Team')).toBeInTheDocument()
    })

    // Open modal.
    await userEvent.click(screen.getByRole('button', { name: /create team/i }))
    await userEvent.type(screen.getByLabelText('Team name'), 'Alpha Team')
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    // Error should appear inline.
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'A team with this name already exists.',
      )
    })

    // Modal must still be open.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  it('create 422 blank → shows inline error', async () => {
    vi.spyOn(teamsApi, 'listTeams').mockResolvedValue([TEAM_A])
    vi.spyOn(teamsApi, 'createTeam').mockRejectedValue(
      new ApiError('validation_error', "Name can't be blank", 422, {
        name: ["can't be blank"],
      }),
    )

    renderTeamsPage()
    await waitFor(() => { expect(screen.getByText('Alpha Team')).toBeInTheDocument() })

    await userEvent.click(screen.getByRole('button', { name: /create team/i }))
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent("Name can't be blank")
    })
  })

  // -------------------------------------------------------------------------
  it('Delete button is disabled when team has references', async () => {
    // TEAM_A has ticket_count=3, epic_count=1 — delete should be disabled.
    vi.spyOn(teamsApi, 'listTeams').mockResolvedValue([TEAM_A])

    renderTeamsPage()

    await waitFor(() => {
      expect(screen.getByText('Alpha Team')).toBeInTheDocument()
    })

    const deleteButton = screen.getByRole('button', { name: /^delete$/i })
    expect(deleteButton).toBeDisabled()
  })

  // -------------------------------------------------------------------------
  it('Delete button is enabled when team has no references', async () => {
    // TEAM_B has ticket_count=0, epic_count=0.
    vi.spyOn(teamsApi, 'listTeams').mockResolvedValue([TEAM_B])

    renderTeamsPage()

    await waitFor(() => {
      expect(screen.getByText('Beta Team')).toBeInTheDocument()
    })

    const deleteButton = screen.getByRole('button', { name: /^delete$/i })
    expect(deleteButton).toBeEnabled()
  })

  // -------------------------------------------------------------------------
  it('delete success → closes dialog and refreshes list', async () => {
    const listSpy = vi
      .spyOn(teamsApi, 'listTeams')
      .mockResolvedValueOnce([TEAM_B]) // initial load
      .mockResolvedValueOnce([])       // after deletion

    vi.spyOn(teamsApi, 'deleteTeam').mockResolvedValue(undefined)

    renderTeamsPage()

    await waitFor(() => {
      expect(screen.getByText('Beta Team')).toBeInTheDocument()
    })

    // Click Delete in the table row — opens confirmation dialog.
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()

    // Confirm deletion (scoped to the dialog to avoid ambiguity with the row button).
    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }))

    // Dialog closes.
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    // List refreshes.
    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledTimes(2)
    })
  })

  // -------------------------------------------------------------------------
  it('delete 409 team_has_references → shows error in dialog', async () => {
    vi.spyOn(teamsApi, 'listTeams').mockResolvedValue([TEAM_B])
    vi.spyOn(teamsApi, 'deleteTeam').mockRejectedValue(
      new ApiError('team_has_references', 'Team has references', 409),
    )

    renderTeamsPage()

    await waitFor(() => {
      expect(screen.getByText('Beta Team')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    // Click confirm inside the dialog.
    const dialog = screen.getByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'This team cannot be deleted while it still has tickets or epics.',
      )
    })
  })
})
