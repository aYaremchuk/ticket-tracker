/**
 * Comment edit/delete — own-comment-only controls in TicketDetailPage.
 *
 * Covered:
 * - Own comment → Edit and Delete controls visible
 * - Other user's comment → no controls rendered
 * - Edit: opens inline textarea, Save calls PATCH, Cancel discards
 * - Edit: 422 blank body shows inline error (server-side guard)
 * - Delete: click Delete → confirm/cancel appear; Confirm calls DELETE
 * - Delete: Cancel hides the confirm buttons
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
import * as ticketsApi from '../api/tickets.ts'
import * as teamsApi from '../api/teams.ts'
import * as epicsApi from '../api/epics.ts'
import { TicketDetailPage } from '../pages/TicketDetailPage.tsx'
import authReducer, { setUser } from '../store/authSlice.ts'
import type { Comment, Ticket } from '../types/api.ts'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CURRENT_USER = { id: 'user-me', email: 'me@example.com' }
const OTHER_USER = { id: 'user-other', email: 'other@example.com' }

const TICKET: Ticket = {
  id: 'ticket-1',
  number: 42,
  team_id: 'team-a',
  epic_id: null,
  type: 'bug',
  state: 'new',
  title: 'A sample ticket',
  body: 'Ticket body text',
  created_by: OTHER_USER,
  created_at: '2026-07-01T10:00:00Z',
  modified_at: '2026-07-06T12:00:00Z',
  comment_count: 2,
}

const OWN_COMMENT: Comment = {
  id: 'comment-own',
  ticket_id: 'ticket-1',
  author: CURRENT_USER,
  body: 'My own comment text',
  created_at: '2026-07-06T11:00:00Z',
}

const OTHER_COMMENT: Comment = {
  id: 'comment-other',
  ticket_id: 'ticket-1',
  author: OTHER_USER,
  body: "Someone else's comment",
  created_at: '2026-07-06T10:30:00Z',
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

function renderTicketDetail(comments: Comment[] = [OWN_COMMENT, OTHER_COMMENT]) {
  const testStore = configureStore({ reducer: { auth: authReducer } })
  // Set the current user so own-comment detection works.
  testStore.dispatch(setUser(CURRENT_USER))

  const qc = makeQueryClient()

  vi.spyOn(ticketsApi, 'getTicket').mockResolvedValue(TICKET)
  vi.spyOn(ticketsApi, 'listTickets').mockResolvedValue({ tickets: [], total: 0 })
  vi.spyOn(teamsApi, 'listTeams').mockResolvedValue([])
  vi.spyOn(epicsApi, 'listEpics').mockResolvedValue([])
  vi.spyOn(commentsApi, 'listComments').mockResolvedValue(comments)

  render(
    <Provider store={testStore}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/tickets/ticket-1']}>
          <Routes>
            <Route path="/tickets/:id" element={<TicketDetailPage />} />
            <Route path="/board" element={<div>Board</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  )

  return { testStore, qc }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TicketDetailPage — comment edit/delete', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('shows Edit and Delete buttons only on own comments, not on others', async () => {
    renderTicketDetail()

    // Wait for comments to load.
    await screen.findByText('My own comment text')
    await screen.findByText("Someone else's comment")

    // Own comment: controls present.
    const ownItem = screen
      .getByText('My own comment text')
      .closest('li') as HTMLElement
    expect(within(ownItem).getByRole('button', { name: /edit comment/i })).toBeInTheDocument()
    expect(within(ownItem).getByRole('button', { name: /delete comment/i })).toBeInTheDocument()

    // Other comment: no controls.
    const otherItem = screen
      .getByText("Someone else's comment")
      .closest('li') as HTMLElement
    expect(within(otherItem).queryByRole('button', { name: /edit comment/i })).toBeNull()
    expect(within(otherItem).queryByRole('button', { name: /delete comment/i })).toBeNull()
  })

  it('clicking Edit opens an inline textarea pre-filled with the comment body', async () => {
    renderTicketDetail()

    await screen.findByText('My own comment text')

    const ownItem = screen
      .getByText('My own comment text')
      .closest('li') as HTMLElement

    await userEvent.click(within(ownItem).getByRole('button', { name: /edit comment/i }))

    const textarea = within(ownItem).getByRole('textbox', { name: /edit comment body/i })
    expect(textarea).toBeInTheDocument()
    expect((textarea as HTMLTextAreaElement).value).toBe('My own comment text')
    // Save and Cancel controls visible.
    expect(within(ownItem).getByRole('button', { name: /save/i })).toBeInTheDocument()
    expect(within(ownItem).getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('Cancel edit discards changes and exits edit mode', async () => {
    renderTicketDetail()
    await screen.findByText('My own comment text')

    const ownItem = screen
      .getByText('My own comment text')
      .closest('li') as HTMLElement

    await userEvent.click(within(ownItem).getByRole('button', { name: /edit comment/i }))

    const textarea = within(ownItem).getByRole('textbox', { name: /edit comment body/i })
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'Changed text')

    await userEvent.click(within(ownItem).getByRole('button', { name: /cancel/i }))

    // Original text is restored, textarea is gone.
    expect(screen.getByText('My own comment text')).toBeInTheDocument()
    expect(within(ownItem).queryByRole('textbox')).toBeNull()
  })

  it('Save calls PATCH and updates the comment in place', async () => {
    const updatedComment: Comment = { ...OWN_COMMENT, body: 'Updated body' }
    vi.spyOn(commentsApi, 'updateComment').mockResolvedValue(updatedComment)

    renderTicketDetail()
    await screen.findByText('My own comment text')

    const ownItem = screen
      .getByText('My own comment text')
      .closest('li') as HTMLElement

    await userEvent.click(within(ownItem).getByRole('button', { name: /edit comment/i }))

    const textarea = within(ownItem).getByRole('textbox', { name: /edit comment body/i })
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'Updated body')

    await userEvent.click(within(ownItem).getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(commentsApi.updateComment).toHaveBeenCalledWith(
        'comment-own',
        'Updated body',
      )
    })

    // Edit mode closes after success.
    await waitFor(() => {
      expect(within(ownItem).queryByRole('textbox')).toBeNull()
    })
    expect(screen.getByText('Updated body')).toBeInTheDocument()
  })

  it('Save with blank body after clearing shows inline error (422 blank)', async () => {
    vi.spyOn(commentsApi, 'updateComment').mockRejectedValue(
      new ApiError('validation_error', "Body can't be blank", 422, {
        body: ["can't be blank"],
      }),
    )

    renderTicketDetail()
    await screen.findByText('My own comment text')

    const ownItem = screen
      .getByText('My own comment text')
      .closest('li') as HTMLElement

    await userEvent.click(within(ownItem).getByRole('button', { name: /edit comment/i }))

    const textarea = within(ownItem).getByRole('textbox', { name: /edit comment body/i })
    // Clear and type a body to pass client guard, then mock the server 422.
    await userEvent.clear(textarea)
    await userEvent.type(textarea, 'nonempty to pass client')

    await userEvent.click(within(ownItem).getByRole('button', { name: /save/i }))

    await waitFor(() => {
      expect(within(ownItem).getByRole('alert')).toHaveTextContent("Body can't be blank")
    })

    // Edit mode stays open.
    expect(within(ownItem).getByRole('textbox', { name: /edit comment body/i })).toBeInTheDocument()
  })

  it('clicking Delete shows confirm/cancel, clicking Cancel hides them', async () => {
    renderTicketDetail()
    await screen.findByText('My own comment text')

    const ownItem = screen
      .getByText('My own comment text')
      .closest('li') as HTMLElement

    await userEvent.click(within(ownItem).getByRole('button', { name: /delete comment/i }))

    expect(within(ownItem).getByRole('button', { name: /confirm delete comment/i })).toBeInTheDocument()
    expect(within(ownItem).getByRole('button', { name: /cancel/i })).toBeInTheDocument()

    await userEvent.click(within(ownItem).getByRole('button', { name: /cancel/i }))

    // Delete control returns, confirm is gone.
    expect(within(ownItem).getByRole('button', { name: /delete comment/i })).toBeInTheDocument()
    expect(within(ownItem).queryByRole('button', { name: /confirm delete comment/i })).toBeNull()
  })

  it('confirming delete calls DELETE and removes the comment from the list', async () => {
    vi.spyOn(commentsApi, 'deleteComment').mockResolvedValue(undefined)

    renderTicketDetail()
    await screen.findByText('My own comment text')

    const ownItem = screen
      .getByText('My own comment text')
      .closest('li') as HTMLElement

    await userEvent.click(within(ownItem).getByRole('button', { name: /delete comment/i }))
    await userEvent.click(within(ownItem).getByRole('button', { name: /confirm delete comment/i }))

    await waitFor(() => {
      expect(commentsApi.deleteComment).toHaveBeenCalledWith('comment-own')
    })

    await waitFor(() => {
      expect(screen.queryByText('My own comment text')).toBeNull()
    })
    // Other comment still there.
    expect(screen.getByText("Someone else's comment")).toBeInTheDocument()
  })
})
