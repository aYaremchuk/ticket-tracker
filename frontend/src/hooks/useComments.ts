/**
 * TanStack Query hooks for Comments (nested under a Ticket).
 *
 * Cache key: ['comments', ticketId] — scoped per ticket.
 *
 * Important: posting a comment does NOT bump ticket's modified_at
 * (per the backend contract), so we do NOT invalidate ['ticket', id] here.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../api/client.ts'
import { addComment, listComments } from '../api/comments.ts'
import type { Comment } from '../types/api.ts'

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export const commentsQueryKey = (ticketId: string) =>
  ['comments', ticketId] as const

// ---------------------------------------------------------------------------
// Error helper
// ---------------------------------------------------------------------------

export function friendlyCommentsError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'validation_error':
        return err.message // "Body can't be blank"
      case 'not_found':
        return 'Ticket not found — it may have been deleted.'
      default:
        return err.message
    }
  }
  return 'An unexpected error occurred. Please try again.'
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/** Fetches comments for a ticket (oldest first). Disabled when ticketId is empty. */
export function useComments(ticketId: string | undefined) {
  return useQuery<Comment[], Error>({
    queryKey: commentsQueryKey(ticketId ?? ''),
    queryFn: () => listComments(ticketId!),
    enabled: Boolean(ticketId),
  })
}

// ---------------------------------------------------------------------------
// Mutation
// ---------------------------------------------------------------------------

/**
 * Add a comment to a ticket.
 * On success, appends the new comment directly to the cache for instant display
 * rather than waiting for a refetch. Does NOT touch the ticket's modified_at.
 */
export function useAddComment(ticketId: string) {
  const queryClient = useQueryClient()

  return useMutation<Comment, Error, string>({
    mutationFn: (body: string) => addComment(ticketId, body),
    onSuccess: (newComment) => {
      // Append to the cached list immediately — avoids a round-trip and keeps
      // the comment-doesn't-bump-modified_at contract visible in the UI.
      queryClient.setQueryData<Comment[]>(
        commentsQueryKey(ticketId),
        (prev) => [...(prev ?? []), newComment],
      )
    },
  })
}
