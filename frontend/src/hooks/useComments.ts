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
import { addComment, deleteComment, listComments, updateComment } from '../api/comments.ts'
import { ticketEventsQueryKey } from './useTicketEvents.ts'
import { ticketQueryKey } from './useTickets.ts'
import type { Comment, Ticket } from '../types/api.ts'

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
      // Keep the cached ticket's comment_count in sync so board/detail badges
      // don't go stale (comments don't bump modified_at, so no refetch happens).
      queryClient.setQueryData<Ticket>(ticketQueryKey(ticketId), (prev) =>
        prev ? { ...prev, comment_count: prev.comment_count + 1 } : prev,
      )
      void queryClient.invalidateQueries({ queryKey: ticketEventsQueryKey(ticketId) })
    },
  })
}

/**
 * Edit a comment body (PATCH /api/comments/:id).
 * Author-only — the UI only renders the control when comment.author.id === currentUser.id.
 * On success, updates the comment in the cached list directly (no ticket invalidation).
 */
export function useUpdateComment(ticketId: string) {
  const queryClient = useQueryClient()

  return useMutation<Comment, Error, { id: string; body: string }>({
    mutationFn: ({ id, body }) => updateComment(id, body),
    onSuccess: (updatedComment) => {
      queryClient.setQueryData<Comment[]>(
        commentsQueryKey(ticketId),
        (prev) =>
          prev?.map((c) => (c.id === updatedComment.id ? updatedComment : c)) ?? prev,
      )
      void queryClient.invalidateQueries({ queryKey: ticketEventsQueryKey(ticketId) })
    },
  })
}

/**
 * Delete a comment (DELETE /api/comments/:id).
 * Author-only — the UI only renders the control when comment.author.id === currentUser.id.
 * On success, removes the comment from the cached list and decrements the ticket's
 * comment_count badge. Does NOT invalidate the ticket's modified_at.
 */
export function useDeleteComment(ticketId: string) {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: (id: string) => deleteComment(id),
    onSuccess: (_void, deletedId) => {
      queryClient.setQueryData<Comment[]>(
        commentsQueryKey(ticketId),
        (prev) => prev?.filter((c) => c.id !== deletedId) ?? prev,
      )
      queryClient.setQueryData<Ticket>(ticketQueryKey(ticketId), (prev) =>
        prev
          ? { ...prev, comment_count: Math.max(0, prev.comment_count - 1) }
          : prev,
      )
      void queryClient.invalidateQueries({ queryKey: ticketEventsQueryKey(ticketId) })
    },
  })
}
