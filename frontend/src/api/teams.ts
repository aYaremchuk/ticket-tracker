/**
 * Teams API — typed wrappers over the shared `request` helper.
 * All fetch logic lives exclusively in the api/ layer per frontend rules.
 */

import { request } from './client.ts'
import type { Team } from '../types/api.ts'

/** GET /api/teams → { teams: Team[] } (name ASC) */
export async function listTeams(): Promise<Team[]> {
  const res = await request<{ teams: Team[] }>('GET', '/teams')
  return res.teams
}

/** POST /api/teams { name } → 201 Team. Throws ApiError on 422 / 409. */
export async function createTeam(name: string): Promise<Team> {
  return request<Team>('POST', '/teams', { name })
}

/** PATCH /api/teams/:id { name } → 200 Team. Throws ApiError on 422 / 409 / 404. */
export async function updateTeam(id: string, name: string): Promise<Team> {
  return request<Team>('PATCH', `/teams/${id}`, { name })
}

/**
 * DELETE /api/teams/:id → 204 (void).
 * Throws ApiError with code "team_has_references" (409) if the team still has
 * tickets or epics. This can't happen until M3/M4 creates those but we handle
 * it now per the contract.
 */
export async function deleteTeam(id: string): Promise<void> {
  return request<void>('DELETE', `/teams/${id}`)
}
