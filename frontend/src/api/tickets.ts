/**
 * Tickets API — typed wrappers over the shared `request` helper.
 * All fetch logic lives exclusively in the api/ layer per frontend rules.
 */

import { request } from './client.ts'
import type {
  Ticket,
  TicketCreateRequest,
  TicketFilters,
  TicketUpdateRequest,
} from '../types/api.ts'

/** GET /api/tickets?team_id=&type=&epic_id=&q= → { tickets, total } (modified_at DESC) */
export async function listTickets(
  filters: Partial<TicketFilters>,
): Promise<{ tickets: Ticket[]; total: number }> {
  const params = new URLSearchParams()
  if (filters.team_id) params.set('team_id', filters.team_id)
  if (filters.type) params.set('type', filters.type)
  if (filters.epic_id) params.set('epic_id', filters.epic_id)
  if (filters.q) params.set('q', filters.q)

  const query = params.toString()
  return request<{ tickets: Ticket[]; total: number }>(
    'GET',
    `/tickets${query ? `?${query}` : ''}`,
  )
}

/** GET /api/tickets/:id → Ticket */
export async function getTicket(id: string): Promise<Ticket> {
  return request<Ticket>('GET', `/tickets/${id}`)
}

/**
 * POST /api/tickets { team_id, type, title, body, epic_id? } → 201 Ticket.
 * Throws ApiError on 422 (validation_error, epic_team_mismatch) or 404.
 */
export async function createTicket(data: TicketCreateRequest): Promise<Ticket> {
  return request<Ticket>('POST', '/tickets', data)
}

/**
 * PATCH /api/tickets/:id { type?, team_id?, epic_id?, title?, body?, state? } → 200 Ticket.
 * Changing team requires epic_id=null or epic in new team, else 422 epic_team_mismatch.
 */
export async function updateTicket(
  id: string,
  patch: TicketUpdateRequest,
): Promise<Ticket> {
  return request<Ticket>('PATCH', `/tickets/${id}`, patch)
}

/**
 * DELETE /api/tickets/:id → 204 (void).
 * Comments cascade-delete at the DB level.
 */
export async function deleteTicket(id: string): Promise<void> {
  return request<void>('DELETE', `/tickets/${id}`)
}
