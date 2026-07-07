/**
 * Board — integration tests.
 *
 * Covered:
 * 1. Columns render from mocked tickets, grouped by state with count badges.
 * 2. Keyboard drag (Enter → ArrowRight → Enter) fires PATCH with the new state.
 * 3. Optimistic move: cache updates immediately, rollback on API failure.
 * 4. Search (debounced) and type filter drive the tickets query.
 *
 * jsdom has no layout, so drag tests mock getBoundingClientRect to give each
 * column a distinct horizontal band (cards inherit their column's rect).
 */

import { configureStore } from '@reduxjs/toolkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client.ts'
import * as epicsApi from '../api/epics.ts'
import * as teamsApi from '../api/teams.ts'
import * as ticketsApi from '../api/tickets.ts'
import {
  ticketsListQueryKey,
  useUpdateTicketState,
} from '../hooks/useTickets.ts'
import type { TicketsListResponse } from '../hooks/useTickets.ts'
import { BoardPage } from '../pages/BoardPage.tsx'
import authReducer from '../store/authSlice.ts'
import type { Epic, Team, Ticket } from '../types/api.ts'

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

const EPIC_A: Epic = {
  id: 'epic-a',
  team_id: 'team-a',
  title: 'Checkout Reliability',
  description: null,
  ticket_count: 2,
  created_at: '2026-06-10T10:00:00Z',
  modified_at: '2026-07-01T09:00:00Z',
}

function makeTicket(overrides: Partial<Ticket>): Ticket {
  return {
    id: 'ticket-x',
    number: 1,
    team_id: 'team-a',
    epic_id: null,
    type: 'bug',
    state: 'new',
    title: 'Some ticket',
    body: 'Body',
    created_by: { id: 'user-1', email: 'alex@example.com' },
    created_at: '2026-07-01T09:00:00Z',
    modified_at: '2026-07-05T09:00:00Z',
    comment_count: 0,
    ...overrides,
  }
}

const TICKET_NEW = makeTicket({
  id: 'ticket-1',
  number: 1,
  type: 'bug',
  state: 'new',
  epic_id: 'epic-a',
  title: 'Payment fails for expired card',
})
const TICKET_PROGRESS = makeTicket({
  id: 'ticket-2',
  number: 2,
  type: 'feature',
  state: 'in_progress',
  title: 'Add retry configuration',
})
const TICKET_PROGRESS_2 = makeTicket({
  id: 'ticket-3',
  number: 3,
  type: 'fix',
  state: 'in_progress',
  title: 'Tighten timeout handling',
})

const ALL_TICKETS = [TICKET_NEW, TICKET_PROGRESS, TICKET_PROGRESS_2]

// ---------------------------------------------------------------------------
// Environment shims for dnd-kit under jsdom
// ---------------------------------------------------------------------------

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??=
  ResizeObserverStub as unknown as typeof ResizeObserver

/**
 * Give each board column a distinct horizontal band; every element inside a
 * column (cards, handles) reports its column's rect. Elements outside any
 * column get the first band.
 */
function mockColumnLayout() {
  const columnLeft: Record<string, number> = {
    new: 0,
    ready_for_implementation: 200,
    in_progress: 400,
    ready_for_acceptance: 600,
    done: 800,
  }
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      const column = this.closest('[data-column]')
      const state = column?.getAttribute('data-column') ?? 'new'
      const left = columnLeft[state] ?? 0
      return {
        x: left,
        y: 0,
        left,
        top: 0,
        right: left + 180,
        bottom: 600,
        width: 180,
        height: 600,
        toJSON: () => ({}),
      } as DOMRect
    },
  )
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function renderBoard() {
  const store = configureStore({ reducer: { auth: authReducer } })
  const qc = makeQueryClient()
  const utils = render(
    <Provider store={store}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/board']}>
          <Routes>
            <Route path="/board" element={<BoardPage />} />
            <Route path="/tickets/:id" element={<div data-testid="detail-page" />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  )
  return { ...utils, qc }
}

function mockHappyApis(tickets: Ticket[] = ALL_TICKETS) {
  vi.spyOn(teamsApi, 'listTeams').mockResolvedValue([TEAM_A])
  vi.spyOn(epicsApi, 'listEpics').mockResolvedValue([EPIC_A])
  return vi
    .spyOn(ticketsApi, 'listTickets')
    .mockResolvedValue({ tickets, total: tickets.length })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BoardPage — rendering', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders 5 workflow columns with tickets grouped by state + counts', async () => {
    mockHappyApis()
    renderBoard()

    // All five columns, in workflow order.
    const columns = await screen.findAllByRole('region')
    expect(columns.map((c) => c.getAttribute('aria-label'))).toEqual([
      'New column',
      'Ready for Implementation column',
      'In Progress column',
      'Ready for Acceptance column',
      'Done column',
    ])

    // Grouping: cards live in the right columns.
    const newColumn = screen.getByRole('region', { name: 'New column' })
    expect(
      within(newColumn).getByText('Payment fails for expired card'),
    ).toBeInTheDocument()
    expect(within(newColumn).getByText('Epic: Checkout Reliability')).toBeInTheDocument()

    const progressColumn = screen.getByRole('region', {
      name: 'In Progress column',
    })
    expect(
      within(progressColumn).getByText('Add retry configuration'),
    ).toBeInTheDocument()
    expect(
      within(progressColumn).getByText('Tighten timeout handling'),
    ).toBeInTheDocument()

    // Count badges: 1 in New, 2 in In Progress, empty columns say so.
    expect(within(newColumn).getByText('1')).toBeInTheDocument()
    expect(within(progressColumn).getByText('2')).toBeInTheDocument()
    const doneColumn = screen.getByRole('region', { name: 'Done column' })
    expect(within(doneColumn).getByText('No tickets')).toBeInTheDocument()

    // Toolbar total from the API's `total`.
    expect(screen.getByText('3 tickets')).toBeInTheDocument()
  })

  it('shows the empty state per column when the team has no tickets', async () => {
    mockHappyApis([])
    renderBoard()

    await screen.findByText('0 tickets')
    expect(screen.getAllByText('No tickets')).toHaveLength(5)
  })
})

describe('BoardPage — drag and drop', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('keyboard drag to the next column PATCHes the new state', async () => {
    mockHappyApis()
    mockColumnLayout()
    const updateSpy = vi
      .spyOn(ticketsApi, 'updateTicket')
      .mockResolvedValue({ ...TICKET_NEW, state: 'ready_for_implementation' })

    renderBoard()
    const handle = await screen.findByRole('button', {
      name: 'Move ticket: Payment fails for expired card',
    })

    // Enter lifts the card (the live region immediately reports the column
    // the card hovers — the "Picked up" announcement is replaced in-place)…
    fireEvent.keyDown(handle, { key: 'Enter', code: 'Enter' })
    await screen.findByText(
      /Ticket "Payment fails for expired card" is over the New column/,
    )

    // …ArrowRight jumps it one column right…
    fireEvent.keyDown(document, { key: 'ArrowRight', code: 'ArrowRight' })
    await screen.findByText(/is over the Ready for Implementation column/)

    // …Enter drops it.
    fireEvent.keyDown(document, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(updateSpy).toHaveBeenCalledWith('ticket-1', {
        state: 'ready_for_implementation',
      })
    })
  })

  it('dropping a card back on its own column does not PATCH', async () => {
    mockHappyApis()
    mockColumnLayout()
    const updateSpy = vi.spyOn(ticketsApi, 'updateTicket')

    renderBoard()
    const handle = await screen.findByRole('button', {
      name: 'Move ticket: Payment fails for expired card',
    })

    fireEvent.keyDown(handle, { key: 'Enter', code: 'Enter' })
    await screen.findByText(/is over the New column/)
    fireEvent.keyDown(document, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(screen.getByText(/was dropped/)).toBeInTheDocument()
    })
    expect(updateSpy).not.toHaveBeenCalled()
  })
})

describe('useUpdateTicketState — optimistic move + rollback', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const filters = { team_id: 'team-a' }
  const listKey = ticketsListQueryKey(filters)

  function seedClient() {
    const qc = makeQueryClient()
    qc.setQueryData<TicketsListResponse>(listKey, {
      tickets: [TICKET_NEW],
      total: 1,
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    )
    return { qc, wrapper }
  }

  it('moves the ticket in the cache immediately on success', async () => {
    const { qc, wrapper } = seedClient()
    let resolve!: (t: Ticket) => void
    vi.spyOn(ticketsApi, 'updateTicket').mockImplementation(
      () => new Promise<Ticket>((res) => (resolve = res)),
    )

    const { result } = renderHook(() => useUpdateTicketState(filters), {
      wrapper,
    })
    act(() => {
      result.current.mutate({ id: 'ticket-1', state: 'done' })
    })

    // Optimistic: cache reflects the move before the API resolves.
    await waitFor(() => {
      expect(
        qc.getQueryData<TicketsListResponse>(listKey)?.tickets[0]?.state,
      ).toBe('done')
    })

    act(() => resolve({ ...TICKET_NEW, state: 'done' }))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(
      qc.getQueryData<TicketsListResponse>(listKey)?.tickets[0]?.state,
    ).toBe('done')
  })

  it('rolls back the cache and reports an error message on failure', async () => {
    const { qc, wrapper } = seedClient()
    let reject!: (e: Error) => void
    vi.spyOn(ticketsApi, 'updateTicket').mockImplementation(
      () => new Promise<Ticket>((_res, rej) => (reject = rej)),
    )
    const onError = vi.fn()

    const { result } = renderHook(
      () => useUpdateTicketState(filters, onError),
      { wrapper },
    )
    act(() => {
      result.current.mutate({ id: 'ticket-1', state: 'done' })
    })

    // Optimistically moved…
    await waitFor(() => {
      expect(
        qc.getQueryData<TicketsListResponse>(listKey)?.tickets[0]?.state,
      ).toBe('done')
    })

    // …then the API fails → rolled back + toast message emitted.
    act(() => reject(new ApiError('not_found', 'Ticket not found', 404)))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(
      qc.getQueryData<TicketsListResponse>(listKey)?.tickets[0]?.state,
    ).toBe('new')
    expect(onError).toHaveBeenCalledWith(
      'Could not move the ticket. It was returned to its column.',
    )
  })
})

describe('BoardPage — loading and error states', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders BoardSkeleton while tickets are loading', async () => {
    vi.spyOn(teamsApi, 'listTeams').mockResolvedValue([TEAM_A])
    vi.spyOn(epicsApi, 'listEpics').mockResolvedValue([EPIC_A])
    // Never-resolving promise keeps the loading state visible.
    vi.spyOn(ticketsApi, 'listTickets').mockImplementation(
      () => new Promise<{ tickets: Ticket[]; total: number }>(() => {}),
    )

    renderBoard()

    // The skeleton has role="status" and the aria-label "Loading board".
    expect(
      await screen.findByRole('status', { name: 'Loading board' }),
    ).toBeInTheDocument()
  })

  it('renders error card with Retry button when the tickets query fails', async () => {
    vi.spyOn(teamsApi, 'listTeams').mockResolvedValue([TEAM_A])
    vi.spyOn(epicsApi, 'listEpics').mockResolvedValue([EPIC_A])
    vi.spyOn(ticketsApi, 'listTickets').mockRejectedValue(
      new ApiError('server_error', 'Internal server error', 500),
    )

    renderBoard()

    // Error message.
    await screen.findByRole('alert')
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load the board')

    // Retry button exists.
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })
})

describe('BoardPage — filters and search', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('debounced search updates the tickets query with q', async () => {
    const listSpy = mockHappyApis()
    renderBoard()
    await screen.findByText('Payment fails for expired card')

    await userEvent.type(screen.getByLabelText('Search'), 'pay')

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith({ team_id: 'team-a', q: 'pay' })
    })
    // Debounce: no fetch fired for the intermediate keystrokes.
    expect(listSpy).not.toHaveBeenCalledWith({ team_id: 'team-a', q: 'p' })
    expect(listSpy).not.toHaveBeenCalledWith({ team_id: 'team-a', q: 'pa' })
  })

  it('type filter updates the query; Clear resets to team-only', async () => {
    const listSpy = mockHappyApis()
    renderBoard()
    await screen.findByText('Payment fails for expired card')

    await userEvent.selectOptions(screen.getByLabelText('Type'), 'bug')
    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith({ team_id: 'team-a', type: 'bug' })
    })

    await userEvent.selectOptions(
      screen.getByLabelText('Epic'),
      'epic-a',
    )
    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith({
        team_id: 'team-a',
        type: 'bug',
        epic_id: 'epic-a',
      })
    })

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => {
      expect(listSpy).toHaveBeenLastCalledWith({ team_id: 'team-a' })
    })
  })
})
