/**
 * Ticket activity history API — typed wrapper over the shared `request` helper.
 * Read-only: events are written server-side when a ticket is created or edited.
 */

import { request } from './client.ts'
import type { TicketEvent } from '../types/api.ts'

/** GET /api/tickets/:ticketId/events → { events: TicketEvent[] } (newest first) */
export async function listTicketEvents(ticketId: string): Promise<TicketEvent[]> {
  const res = await request<{ events: TicketEvent[] }>(
    'GET',
    `/tickets/${ticketId}/events`,
  )
  return res.events
}
