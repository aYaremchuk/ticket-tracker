/**
 * Comments API — typed wrappers over the shared `request` helper.
 * All fetch logic lives exclusively in the api/ layer per frontend rules.
 */

import { request } from './client.ts'
import type { Comment } from '../types/api.ts'

/** GET /api/tickets/:ticketId/comments → { comments: Comment[] } (oldest first) */
export async function listComments(ticketId: string): Promise<Comment[]> {
  const res = await request<{ comments: Comment[] }>(
    'GET',
    `/tickets/${ticketId}/comments`,
  )
  return res.comments
}

/**
 * POST /api/tickets/:ticketId/comments { body } → 201 Comment.
 * Throws ApiError on 422 (blank body).
 * Note: posting a comment does NOT bump the ticket's modified_at.
 */
export async function addComment(
  ticketId: string,
  body: string,
): Promise<Comment> {
  return request<Comment>('POST', `/tickets/${ticketId}/comments`, { body })
}
