/**
 * Epics API — typed wrappers over the shared `request` helper.
 * All fetch logic lives exclusively in the api/ layer per frontend rules.
 */

import { request } from './client.ts'
import type { Epic } from '../types/api.ts'

/** GET /api/epics?team_id=<uuid> → { epics: Epic[] } (title ASC) */
export async function listEpics(teamId: string): Promise<Epic[]> {
  const res = await request<{ epics: Epic[] }>('GET', `/epics?team_id=${encodeURIComponent(teamId)}`)
  return res.epics
}

/** POST /api/epics { team_id, title, description? } → 201 Epic. */
export async function createEpic(data: {
  team_id: string
  title: string
  description?: string | null
}): Promise<Epic> {
  return request<Epic>('POST', '/epics', data)
}

/**
 * PATCH /api/epics/:id { title?, description? } → 200 Epic.
 * team_id is immutable — never send it on update.
 */
export async function updateEpic(
  id: string,
  data: { title?: string; description?: string | null },
): Promise<Epic> {
  return request<Epic>('PATCH', `/epics/${id}`, data)
}

/**
 * DELETE /api/epics/:id → 204 (void).
 * Throws ApiError with code "epic_has_tickets" (409) if the epic has tickets.
 * This won't occur until M4 creates tickets but we handle it per the contract.
 */
export async function deleteEpic(id: string): Promise<void> {
  return request<void>('DELETE', `/epics/${id}`)
}
