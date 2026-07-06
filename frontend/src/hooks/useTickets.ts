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
  TicketUpdateRequest,
} from '../types/api.ts'

// ---------------------------------------------------------------------------
// Query key factories
// ---------------------------------------------------------------------------

export const ticketQueryKey = (id: string) => ['ticket', id] as const
export const ticketsListQueryKey = (filters?: Partial<TicketFilters>) =>
  filters ? (['tickets', filters] as const) : (['tickets'] as const)

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

/** Fetches the ticket list with optional filters. Used by the board (M5). */
export function useTickets(filters?: Partial<TicketFilters>) {
  return useQuery<{ tickets: Ticket[]; total: number }, Error>({
    queryKey: ticketsListQueryKey(filters),
    queryFn: () => listTickets(filters ?? {}),
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
