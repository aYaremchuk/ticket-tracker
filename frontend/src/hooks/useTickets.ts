/**
 * TanStack Query hooks for the Tickets resource.
 *
 * Server state (single ticket + mutations) lives here. The board list (M5)
 * will use separate query keys. Comments are in useComments.ts.
 *
 * Cache key shapes:
 *   ['ticket', id]         — single ticket detail
 *   ['tickets']            — list (invalidated on create/delete for board M5)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client.ts'
import {
  createTicket,
  deleteTicket,
  getTicket,
  listTickets,
  updateTicket,
} from '../api/tickets.ts'
import type {
  Ticket,
  TicketCreateRequest,
  TicketFilters,
  TicketState,
  TicketUpdateRequest,
} from '../types/api.ts'

// ---------------------------------------------------------------------------
// Query key factories
// ---------------------------------------------------------------------------

export const ticketQueryKey = (id: string) => ['ticket', id] as const
export const ticketsListQueryKey = (filters?: Partial<TicketFilters>) =>
  filters ? (['tickets', filters] as const) : (['tickets'] as const)

/** Shape of GET /api/tickets responses (also the board's cache entry shape). */
export interface TicketsListResponse {
  tickets: Ticket[]
  total: number
}

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

/**
 * Map a thrown error to a human-readable display string.
 * The Tickets UI cares about:
 *   - epic_team_mismatch: user changed team but kept an epic from the old team.
 *   - validation_error:   blank title/body or invalid enum.
 *   - not_found:          stale link / ticket deleted by someone else.
 */
export function friendlyTicketsError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'epic_team_mismatch':
        return 'The selected epic does not belong to the chosen team. Please pick a different epic or clear it.'
      case 'validation_error':
        // Server message is already human-readable ("Title can't be blank", etc.)
        return err.message
      case 'not_found':
        return 'Ticket not found — it may have been deleted.'
      default:
        return err.message
    }
  }
  return 'An unexpected error occurred. Please try again.'
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Fetches a single ticket by UUID. Disabled when id is empty. */
export function useTicket(id: string | undefined) {
  return useQuery<Ticket, Error>({
    queryKey: ticketQueryKey(id ?? ''),
    queryFn: () => getTicket(id!),
    enabled: Boolean(id),
  })
}

/**
 * Fetches the ticket list with optional filters. Used by the board (M5).
 * `placeholderData` keeps the previous page of tickets on screen while a new
 * filter combination fetches — no skeleton flash on every keystroke/filter.
 */
export function useTickets(
  filters?: Partial<TicketFilters>,
  options?: { enabled?: boolean },
) {
  return useQuery<TicketsListResponse, Error>({
    queryKey: ticketsListQueryKey(filters),
    queryFn: () => listTickets(filters ?? {}),
    enabled: options?.enabled ?? true,
    placeholderData: (previous) => previous,
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Create a ticket. On success, invalidates the tickets list. */
export function useCreateTicket() {
  const queryClient = useQueryClient()

  return useMutation<Ticket, Error, TicketCreateRequest>({
    mutationFn: (data) => createTicket(data),
    onSuccess: () => {
      // Invalidate all ticket list queries (board columns in M5).
      void queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}

/** Update a ticket. On success, invalidates the specific ticket + list. */
export function useUpdateTicket(id: string) {
  const queryClient = useQueryClient()

  return useMutation<Ticket, Error, TicketUpdateRequest>({
    mutationFn: (patch) => updateTicket(id, patch),
    onSuccess: (updated) => {
      // Update the cached ticket directly to avoid a redundant refetch.
      queryClient.setQueryData(ticketQueryKey(id), updated)
      void queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}

export interface MoveTicketVars {
  id: string
  state: TicketState
}

/**
 * Board drag-and-drop mutation — optimistic update + rollback (per the
 * dragdrop-rollback skill):
 *   onMutate  — snapshot the current list, move the card in the cache NOW.
 *   onError   — restore the snapshot (card jumps back) + surface a toast
 *               message via `onErrorMessage`.
 *   onSettled — invalidate so the server-ordered (modified_at DESC) list
 *               re-syncs either way.
 *
 * `filters` must be the exact filter object the board's useTickets uses so we
 * patch the same cache entry the columns render from.
 */
export function useUpdateTicketState(
  filters: Partial<TicketFilters> | undefined,
  onErrorMessage?: (message: string) => void,
) {
  const queryClient = useQueryClient()
  const listKey = ticketsListQueryKey(filters)

  return useMutation<
    Ticket,
    Error,
    MoveTicketVars,
    { previous?: TicketsListResponse }
  >({
    mutationFn: ({ id, state }) => updateTicket(id, { state }),

    onMutate: async ({ id, state }) => {
      // Don't let an in-flight refetch overwrite the optimistic move.
      await queryClient.cancelQueries({ queryKey: listKey })
      const previous = queryClient.getQueryData<TicketsListResponse>(listKey)
      queryClient.setQueryData<TicketsListResponse>(listKey, (old) =>
        old
          ? {
              ...old,
              tickets: old.tickets.map((t) =>
                t.id === id ? { ...t, state } : t,
              ),
            }
          : old,
      )
      return { previous }
    },

    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(listKey, context.previous)
      onErrorMessage?.(
        'Could not move the ticket. It was returned to its column.',
      )
    },

    onSuccess: (updated, { id }) => {
      // Keep the detail-page cache consistent with the new state.
      queryClient.setQueryData(ticketQueryKey(id), updated)
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: listKey })
    },
  })
}

/** Delete a ticket. On success, removes it from the cache + invalidates list. */
export function useDeleteTicket(id: string) {
  const queryClient = useQueryClient()

  return useMutation<void, Error, void>({
    mutationFn: () => deleteTicket(id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ticketQueryKey(id) })
      void queryClient.invalidateQueries({ queryKey: ['tickets'] })
    },
  })
}
