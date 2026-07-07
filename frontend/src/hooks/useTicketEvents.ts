/**
 * TanStack Query hook for a ticket's activity history.
 *
 * Cache key: ['ticket-events', ticketId]. Invalidated by the ticket update
 * mutations in useTickets.ts, since every successful edit appends events.
 */

import { useQuery } from '@tanstack/react-query'
import { listTicketEvents } from '../api/ticketEvents.ts'
import type { TicketEvent } from '../types/api.ts'

export const ticketEventsQueryKey = (ticketId: string) =>
  ['ticket-events', ticketId] as const

/** Fetches activity events for a ticket (newest first). Disabled when ticketId is empty. */
export function useTicketEvents(ticketId: string | undefined) {
  return useQuery<TicketEvent[], Error>({
    queryKey: ticketEventsQueryKey(ticketId ?? ''),
    queryFn: () => listTicketEvents(ticketId!),
    enabled: Boolean(ticketId),
  })
}
