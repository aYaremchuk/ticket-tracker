/**
 * Tickets screens — integration tests
 *
 * Covered:
 * 1. Create success → navigates to /tickets/:id.
 * 2. Team change → resets the epic select to "No epic".
 * 3. epic_team_mismatch on save → inline error shown.
 * 4. Add comment → appends to the comment list (does NOT update ticket header).
 * 5. Delete confirm → navigates to /board on 204.
 *
 * Strategy: mock api/tickets, api/comments, api/teams, api/epics modules;
 * render pages inside real QueryClientProvider + MemoryRouter so hooks and
 * UI interact naturally.
 */

import { configureStore } from '@reduxjs/toolkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client.ts'
import * as commentsApi from '../api/comments.ts'
import * as epicsApi from '../api/epics.ts'
import * as teamsApi from '../api/teams.ts'
import * as ticketEventsApi from '../api/ticketEvents.ts'
import * as ticketsApi from '../api/tickets.ts'
import { TicketCreatePage } from '../pages/TicketCreatePage.tsx'
import { TicketDetailPage } from '../pages/TicketDetailPage.tsx'
import authReducer from '../store/authSlice.ts'
import type { Comment, Epic, Team, Ticket, TicketEvent } from '../types/api.ts'

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
  epic_count: 1,
  created_at: '2026-06-15T12:00:00Z',
  modified_at: '2026-06-15T12:00:00Z',
}

const EPIC_A: Epic = {
  id: 'epic-a',
  team_id: 'team-a',
  title: 'Checkout Reliability',
  description: null,
  ticket_count: 2,
  created_at: '2026-06-10T10:00:00Z',
  modified_at: '2026-07-01T09:00:00Z',
}

const EPIC_B: Epic = {
  id: 'epic-b',
  team_id: 'team-b',
  title: 'Beta Epic',
  description: null,
  ticket_count: 0,
  created_at: '2026-06-12T10:00:00Z',
  modified_at: '2026-06-12T10:00:00Z',
}

const TICKET: Ticket = {
  id: 'ticket-1',
  number: 42,
  team_id: 'team-a',
  epic_id: 'epic-a',
  type: 'bug',
  state: 'in_progress',
  title: 'Payment fails',
  body: 'Steps to repro…',
  created_by: { id: 'user-1', email: 'alex@example.com' },
  created_at: '2026-06-22T09:15:00Z',
  modified_at: '2026-06-23T12:40:00Z',
  modified_by: { id: 'user-2', email: 'kim@example.com' },
  comment_count: 1,
}

const EVENT_CREATED: TicketEvent = {
  id: 'event-1',
  ticket_id: 'ticket-1',
  actor: { id: 'user-1', email: 'alex@example.com' },
  action: 'created',
  field: null,
  old_value: null,
  new_value: null,
  created_at: '2026-06-22T09:15:00Z',
}

const EVENT_STATE_CHANGED: TicketEvent = {
  id: 'event-2',
  ticket_id: 'ticket-1',
  actor: { id: 'user-2', email: 'kim@example.com' },
  action: 'updated',
  field: 'state',
  old_value: 'new',
  new_value: 'in_progress',
  created_at: '2026-06-23T12:40:00Z',
}

const EVENT_COMMENTED: TicketEvent = {
  id: 'event-3',
  ticket_id: 'ticket-1',
  actor: { id: 'user-1', email: 'alex@example.com' },
  action: 'commented',
  field: null,
  old_value: null,
  new_value: 'Reproduced in Chrome.',
  created_at: '2026-06-24T08:00:00Z',
}

const COMMENT_1: Comment = {
  id: 'comment-1',
  ticket_id: 'ticket-1',
  author: { id: 'user-1', email: 'alex@example.com' },
  body: 'Reproduced in Chrome.',
  created_at: '2026-06-22T10:05:00Z',
}

// ---------------------------------------------------------------------------
// Render helpers
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

function renderCreatePage() {
  const store = makeStore()
  const qc = makeQueryClient()
  const utils = render(
    <Provider store={store}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/tickets/new']}>
          <Routes>
            <Route path="/tickets/new" element={<TicketCreatePage />} />
            {/* Capture navigation target so we can assert it */}
            <Route path="/tickets/:id" element={<div data-testid="detail-page" />} />
            <Route path="/board" element={<div data-testid="board-page" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  )
  return { ...utils, qc }
}

function renderDetailPage(ticketId = 'ticket-1') {
  const store = makeStore()
  const qc = makeQueryClient()
  const utils = render(
    <Provider store={store}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[`/tickets/${ticketId}`]}>
          <Routes>
            <Route path="/tickets/:id" element={<TicketDetailPage />} />
            <Route path="/board" element={<div data-testid="board-page" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  )
  return { ...utils, qc }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TicketCreatePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  it('create success → navigates to /tickets/:id', async () => {
    vi.spyOn(teamsApi, 'listTeams').mockResolvedValue([TEAM_A])
    vi.spyOn(epicsApi, 'listEpics').mockResolvedValue([EPIC_A])
    vi.spyOn(ticketsApi, 'createTicket').mockResolvedValue(TICKET)

    renderCreatePage()

    // Wait for teams to load (form becomes usable).
    await waitFor(() => {
      expect(screen.getByText('Alpha Team')).toBeInTheDocument()
    })

    // Fill in required fields.
    await userEvent.clear(screen.getByLabelText('Title'))
    await userEvent.type(screen.getByLabelText('Title'), 'Payment fails')

    await userEvent.clear(screen.getByLabelText('Body'))
    await userEvent.type(screen.getByLabelText('Body'), 'Steps to repro…')

    // Submit.
    await userEvent.click(screen.getByRole('button', { name: /create ticket/i }))

    // Should navigate away to the detail page.
    await waitFor(() => {
      expect(screen.getByTestId('detail-page')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  it('team change → epic select is reset to "No epic"', async () => {
    vi.spyOn(teamsApi, 'listTeams').mockResolvedValue([TEAM_A, TEAM_B])
    vi.spyOn(epicsApi, 'listEpics')
      .mockImplementation((teamId) => {
        if (teamId === 'team-a') return Promise.resolve([EPIC_A])
        if (teamId === 'team-b') return Promise.resolve([EPIC_B])
        return Promise.resolve([])
      })

    renderCreatePage()

    // Wait for teams to load.
    await waitFor(() => {
      expect(screen.getByText('Alpha Team')).toBeInTheDocument()
    })

    // Explicitly select team-a to ensure epics load for that team.
    const teamSelect = screen.getByLabelText('Team')
    await userEvent.selectOptions(teamSelect, 'team-a')

    // Wait for team-a's epics to appear.
    await waitFor(() => {
      expect(screen.getByText('Checkout Reliability')).toBeInTheDocument()
    })

    // Select the epic for team-a.
    const epicSelect = screen.getByLabelText('Epic')
    await userEvent.selectOptions(epicSelect, 'epic-a')
    expect(epicSelect).toHaveValue('epic-a')

    // Now switch to team-b.
    await userEvent.selectOptions(teamSelect, 'team-b')

    // Epic should have been reset to empty ("No epic").
    await waitFor(() => {
      expect(epicSelect).toHaveValue('')
    })
  })

  // -------------------------------------------------------------------------
  it('epic_team_mismatch on save → inline error shown', async () => {
    vi.spyOn(teamsApi, 'listTeams').mockResolvedValue([TEAM_A])
    vi.spyOn(epicsApi, 'listEpics').mockResolvedValue([EPIC_A])
    vi.spyOn(ticketsApi, 'createTicket').mockRejectedValue(
      new ApiError(
        'epic_team_mismatch',
        'The epic does not belong to the selected team.',
        422,
      ),
    )

    renderCreatePage()

    await waitFor(() => {
      expect(screen.getByText('Alpha Team')).toBeInTheDocument()
    })

    await userEvent.type(screen.getByLabelText('Title'), 'Some ticket')
    await userEvent.type(screen.getByLabelText('Body'), 'Details here')
    await userEvent.click(screen.getByRole('button', { name: /create ticket/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /epic.*does not belong/i,
      )
    })
  })
})

describe('TicketDetailPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  it('renders ticket metadata header correctly', async () => {
    vi.spyOn(ticketsApi, 'getTicket').mockResolvedValue(TICKET)
    vi.spyOn(teamsApi, 'listTeams').mockResolvedValue([TEAM_A])
    vi.spyOn(epicsApi, 'listEpics').mockResolvedValue([EPIC_A])
    vi.spyOn(commentsApi, 'listComments').mockResolvedValue([COMMENT_1])
    vi.spyOn(ticketEventsApi, 'listTicketEvents').mockResolvedValue([EVENT_CREATED])

    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByText(/TCK-42/)).toBeInTheDocument()
    })

    // Email local-parts should appear for both creator and last modifier.
    expect(screen.getByText(/Created by alex/i)).toBeInTheDocument()
    expect(screen.getByText(/Modified .* by kim/i)).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  it('add comment → appends to the list without changing modified_at header', async () => {
    const newComment: Comment = {
      id: 'comment-2',
      ticket_id: 'ticket-1',
      author: { id: 'user-1', email: 'alex@example.com' },
      body: 'New comment text.',
      created_at: '2026-06-23T14:00:00Z',
    }

    vi.spyOn(ticketsApi, 'getTicket').mockResolvedValue(TICKET)
    vi.spyOn(teamsApi, 'listTeams').mockResolvedValue([TEAM_A])
    vi.spyOn(epicsApi, 'listEpics').mockResolvedValue([EPIC_A])
    vi.spyOn(commentsApi, 'listComments').mockResolvedValue([COMMENT_1])
    vi.spyOn(commentsApi, 'addComment').mockResolvedValue(newComment)
    vi.spyOn(ticketEventsApi, 'listTicketEvents').mockResolvedValue([EVENT_CREATED])

    renderDetailPage()

    // Wait for the page to load.
    await waitFor(() => {
      expect(screen.getByText('Reproduced in Chrome.')).toBeInTheDocument()
    })

    // Capture the modified_at text before posting.
    const headerBefore = screen.getByText(/Modified/i).textContent

    // Post a comment.
    const commentTextarea = screen.getByLabelText('Add comment')
    await userEvent.type(commentTextarea, 'New comment text.')
    await userEvent.click(screen.getByRole('button', { name: /post comment/i }))

    // New comment appears in the list.
    await waitFor(() => {
      expect(screen.getByText('New comment text.')).toBeInTheDocument()
    })

    // modified_at in the header must NOT have changed (comment doesn't bump it).
    const headerAfter = screen.getByText(/Modified/i).textContent
    expect(headerAfter).toBe(headerBefore)
  })

  // -------------------------------------------------------------------------
  it('activity panel shows history newest-first with human-readable values', async () => {
    vi.spyOn(ticketsApi, 'getTicket').mockResolvedValue(TICKET)
    vi.spyOn(teamsApi, 'listTeams').mockResolvedValue([TEAM_A])
    vi.spyOn(epicsApi, 'listEpics').mockResolvedValue([EPIC_A])
    vi.spyOn(commentsApi, 'listComments').mockResolvedValue([])
    vi.spyOn(ticketEventsApi, 'listTicketEvents').mockResolvedValue([
      EVENT_COMMENTED,
      EVENT_STATE_CHANGED,
      EVENT_CREATED,
    ])

    renderDetailPage()

    // Wait for the events to load into the Activity panel.
    await waitFor(() => {
      expect(screen.getByText('New → In Progress')).toBeInTheDocument()
    })

    const panel = screen.getByText('Activity').closest('div') as HTMLElement

    // Updated event: actor, humanized field + enum values ("new" → "New").
    expect(within(panel).getByText('kim')).toBeInTheDocument()
    expect(within(panel).getByText(/changed State/)).toBeInTheDocument()

    // Comment event: "commented" with the body preview.
    expect(within(panel).getByText(/commented/)).toBeInTheDocument()
    expect(within(panel).getByText('“Reproduced in Chrome.”')).toBeInTheDocument()

    // Created event present, and events listed newest-first.
    expect(within(panel).getByText(/created this ticket/)).toBeInTheDocument()
    const items = within(panel).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent(/commented/)
    expect(items[1]).toHaveTextContent(/changed State/)
    expect(items[2]).toHaveTextContent(/created this ticket/)
  })

  // -------------------------------------------------------------------------
  it('activity panel renders the empty state when there are no events', async () => {
    vi.spyOn(ticketsApi, 'getTicket').mockResolvedValue(TICKET)
    vi.spyOn(teamsApi, 'listTeams').mockResolvedValue([TEAM_A])
    vi.spyOn(epicsApi, 'listEpics').mockResolvedValue([EPIC_A])
    vi.spyOn(commentsApi, 'listComments').mockResolvedValue([])
    vi.spyOn(ticketEventsApi, 'listTicketEvents').mockResolvedValue([])

    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByText('No activity yet.')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  it('delete confirm → navigates to /board', async () => {
    vi.spyOn(ticketsApi, 'getTicket').mockResolvedValue(TICKET)
    vi.spyOn(teamsApi, 'listTeams').mockResolvedValue([TEAM_A])
    vi.spyOn(epicsApi, 'listEpics').mockResolvedValue([EPIC_A])
    vi.spyOn(commentsApi, 'listComments').mockResolvedValue([])
    vi.spyOn(ticketEventsApi, 'listTicketEvents').mockResolvedValue([EVENT_CREATED])
    vi.spyOn(ticketsApi, 'deleteTicket').mockResolvedValue(undefined)

    renderDetailPage()

    await waitFor(() => {
      expect(screen.getByText(/TCK-42/)).toBeInTheDocument()
    })

    // Click the Delete button to open confirmation.
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    // Confirmation dialog should appear.
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toBeInTheDocument()

    // Click confirm Delete inside the dialog.
    await userEvent.click(within(dialog).getByRole('button', { name: /^delete$/i }))

    // Should navigate to /board.
    await waitFor(() => {
      expect(screen.getByTestId('board-page')).toBeInTheDocument()
    })
  })
})
