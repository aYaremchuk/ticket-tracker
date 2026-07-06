/**
 * TanStack Query hooks for the Epics resource.
 *
 * Server state (list + mutations) lives here; UI state (panel open/close,
 * selected epic) stays in the calling component.
 *
 * Error messages: ApiError.code is mapped to friendly copy before bubbling to
 * the component so UI code never branches on raw codes.
 *
 * Cache key shape: ['epics', teamId] — scoped per team so selecting a different
 * team fetches (and caches) independently.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client.ts'
import { createEpic, deleteEpic, listEpics, updateEpic } from '../api/epics.ts'
import type { Epic } from '../types/api.ts'

// Stable query key factory — used for both cache lookup and invalidation.
export const epicsQueryKey = (teamId: string) => ['epics', teamId] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a thrown error to a human-readable message string.
 * Returns the ApiError message for most cases, with friendlier overrides for
 * the codes the Epics UI cares about.
 */
export function friendlyEpicsError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'epic_has_tickets':
        return 'This epic cannot be deleted while tickets reference it.'
      case 'validation_error':
        // Server message already says "Title can't be blank" etc.
        return err.message
      case 'not_found':
        return 'Epic not found — it may have been deleted.'
      default:
        return err.message
    }
  }
  return 'An unexpected error occurred. Please try again.'
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Fetches epics for a given team (title ASC).
 * Query is disabled when teamId is empty/undefined.
 */
export function useEpics(teamId: string | undefined) {
  return useQuery<Epic[], Error>({
    queryKey: epicsQueryKey(teamId ?? ''),
    queryFn: () => listEpics(teamId!),
    // Only run when a team is actually selected.
    enabled: Boolean(teamId),
  })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Create an epic under the given team. Invalidates ['epics', teamId] on success. */
export function useCreateEpic(teamId: string) {
  const queryClient = useQueryClient()

  return useMutation<
    Epic,
    Error,
    { title: string; description?: string | null }
  >({
    mutationFn: (data) => createEpic({ team_id: teamId, ...data }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: epicsQueryKey(teamId) })
    },
  })
}

/** Update an epic's title and/or description. Invalidates on success. */
export function useUpdateEpic(teamId: string) {
  const queryClient = useQueryClient()

  return useMutation<
    Epic,
    Error,
    { id: string; title?: string; description?: string | null }
  >({
    mutationFn: ({ id, ...data }) => updateEpic(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: epicsQueryKey(teamId) })
    },
  })
}

/**
 * Delete an epic. Invalidates on success.
 * 409 epic_has_tickets is surfaced via mutation.error — caller shows the message.
 */
export function useDeleteEpic(teamId: string) {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: (id: string) => deleteEpic(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: epicsQueryKey(teamId) })
    },
  })
}
