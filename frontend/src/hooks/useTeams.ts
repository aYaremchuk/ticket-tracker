/**
 * TanStack Query hooks for the Teams resource.
 *
 * Server state (list + mutations) lives here; UI state (modal open/close,
 * selected id) stays in the calling component.
 *
 * Error messages: ApiError.code is mapped to friendly copy before bubbling to
 * the component so UI code never branches on raw codes.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client.ts'
import { createTeam, deleteTeam, listTeams, updateTeam } from '../api/teams.ts'
import type { Team } from '../types/api.ts'

// Stable query key — used for both cache lookup and invalidation.
export const TEAMS_QUERY_KEY = ['teams'] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a thrown error to a human-readable message string.
 * Returns the ApiError message for most cases, with friendlier overrides for
 * the codes the Teams UI cares about.
 */
function friendlyTeamsError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'team_duplicate':
        return 'A team with this name already exists.'
      case 'team_has_references':
        return 'This team cannot be deleted while it still has tickets or epics.'
      case 'validation_error':
        // Fall through to the server message which already says "Name can't be blank".
        return err.message
      case 'not_found':
        return 'Team not found — it may have been deleted.'
      default:
        return err.message
    }
  }
  return 'An unexpected error occurred. Please try again.'
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/** Fetches the team list (name ASC). Exposes loading / error / data. */
export function useTeams() {
  return useQuery<Team[], Error>({
    queryKey: TEAMS_QUERY_KEY,
    queryFn: listTeams,
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface MutationResult {
  /** Friendly, display-ready error string or null when there is no error. */
  errorMessage: string | null
}

/**
 * Create a team.
 * On success, invalidates the teams list so the table refreshes automatically.
 * Returns `{ errorMessage }` from `mutation.data` on API error so the modal can
 * display inline errors without crashing the query.
 */
export function useCreateTeam() {
  const queryClient = useQueryClient()

  return useMutation<Team, Error, string>({
    mutationFn: (name: string) => createTeam(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEAMS_QUERY_KEY })
    },
    // Let errors surface via mutation.error so the caller can read friendlyTeamsError.
  })
}

/** Rename a team. Invalidates on success. */
export function useUpdateTeam() {
  const queryClient = useQueryClient()

  return useMutation<Team, Error, { id: string; name: string }>({
    mutationFn: ({ id, name }) => updateTeam(id, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEAMS_QUERY_KEY })
    },
  })
}

/** Delete a team. Invalidates on success. */
export function useDeleteTeam() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: (id: string) => deleteTeam(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: TEAMS_QUERY_KEY })
    },
  })
}

// Re-export so callers can map their own errors without importing client.ts.
export { friendlyTeamsError }
