/**
 * Ticket detail + edit screen — M4.
 *
 * Layout (wireframe 3):
 *   - Back link to /board.
 *   - Header meta: TCK-<number> • Created by <email local-part> • Created <ts> • Modified <ts>
 *   - Two-column: left 2/3 = form (Team/Type/State/Epic/Title/Body), right 1/3 = comments.
 *   - Save → PATCH via useUpdateTicket.
 *   - Delete → confirmation → DELETE via useDeleteTicket → navigate to /board.
 *   - Comments: list oldest-first; "Add comment" → useAddComment; 422 blank inline.
 *
 * Critically: posting a comment does NOT update the ticket's modified_at header.
 * The header only refreshes on a real ticket save (PATCH).
 */

import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client.ts'
import { Button } from '../components/ui/Button.tsx'
import { Card } from '../components/ui/Card.tsx'
import { Textarea } from '../components/ui/Textarea.tsx'
import { TicketForm } from '../components/TicketForm.tsx'
import {
  friendlyCommentsError,
  useAddComment,
  useComments,
  useDeleteComment,
  useUpdateComment,
} from '../hooks/useComments.ts'
import { friendlyTicketsError, useDeleteTicket, useTicket, useUpdateTicket } from '../hooks/useTickets.ts'
import { useAppSelector } from '../store/index.ts'
import type { TicketFormValues } from '../components/TicketForm.tsx'
import type { Comment } from '../types/api.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format an ISO-8601 UTC timestamp for display: "Jul 6, 2026, 12:40 UTC" */
function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  })
}

/** Extract the local-part of an email address ("alex@example.com" → "alex"). */
function emailLocalPart(email: string): string {
  return email.split('@')[0] ?? email
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog (inline state — no separate modal component needed)
// ---------------------------------------------------------------------------

interface DeleteConfirmProps {
  ticketId: string
  onCancel: () => void
}

function DeleteConfirm({ ticketId, onCancel }: DeleteConfirmProps) {
  const navigate = useNavigate()
  const deleteTicket = useDeleteTicket(ticketId)

  const errorMessage = deleteTicket.error
    ? friendlyTicketsError(deleteTicket.error)
    : null

  function handleConfirm() {
    deleteTicket.mutate(undefined, {
      onSuccess: () => {
        void navigate('/board')
      },
    })
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h2
          id="delete-dialog-title"
          className="text-lg font-bold text-slate-900"
        >
          Delete ticket?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          This action cannot be undone. All comments will also be removed.
        </p>
        {errorMessage && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {errorMessage}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={deleteTicket.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={deleteTicket.isPending}
          >
            {deleteTicket.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single comment item — handles inline edit + delete for own comments
// ---------------------------------------------------------------------------

interface CommentItemProps {
  comment: Comment
  ticketId: string
  isOwn: boolean
}

function CommentItem({ comment, ticketId, isOwn }: CommentItemProps) {
  const [editMode, setEditMode] = useState(false)
  const [editBody, setEditBody] = useState(comment.body)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const updateComment = useUpdateComment(ticketId)
  const deleteComment = useDeleteComment(ticketId)

  const editError =
    updateComment.error instanceof ApiError &&
    updateComment.error.code === 'validation_error'
      ? updateComment.error.message
      : updateComment.error
        ? friendlyCommentsError(updateComment.error)
        : null

  function handleEdit() {
    setEditBody(comment.body)
    setEditMode(true)
  }

  function handleCancelEdit() {
    setEditMode(false)
    updateComment.reset()
  }

  function handleSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = editBody.trim()
    if (!trimmed) return
    updateComment.mutate(
      { id: comment.id, body: trimmed },
      { onSuccess: () => setEditMode(false) },
    )
  }

  function handleDelete() {
    deleteComment.mutate(comment.id)
  }

  return (
    <li className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-bold text-slate-900">
          {emailLocalPart(comment.author.email)}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-slate-500">
            {formatTimestamp(comment.created_at)}
          </span>
          {/* Edit/Delete controls visible only for own comments */}
          {isOwn && !editMode && (
            <>
              <button
                type="button"
                onClick={handleEdit}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                aria-label="Edit comment"
              >
                Edit
              </button>
              {confirmDelete ? (
                <span className="flex items-center gap-1 text-xs">
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleteComment.isPending}
                    className="font-semibold text-red-600 hover:text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-50"
                    aria-label="Confirm delete comment"
                  >
                    {deleteComment.isPending ? 'Deleting…' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="font-semibold text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs font-semibold text-slate-500 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
                  aria-label="Delete comment"
                >
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {editMode ? (
        <form className="mt-2" onSubmit={(e) => handleSaveEdit(e)}>
          <Textarea
            label=""
            rows={3}
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            aria-label="Edit comment body"
            aria-describedby={editError ? 'edit-comment-error' : undefined}
            disabled={updateComment.isPending}
          />
          {editError && (
            <p id="edit-comment-error" role="alert" className="mt-1 text-sm text-red-600">
              {editError}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCancelEdit}
              disabled={updateComment.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={updateComment.isPending || editBody.trim() === ''}
            >
              {updateComment.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-2 text-sm text-slate-700">{comment.body}</p>
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Comments panel
// ---------------------------------------------------------------------------

interface CommentsPanelProps {
  ticketId: string
}

function CommentsPanel({ ticketId }: CommentsPanelProps) {
  const [commentBody, setCommentBody] = useState('')
  const { data: comments, isLoading, error } = useComments(ticketId)
  const addComment = useAddComment(ticketId)

  // Current user from the Redux store — used for own-comment detection.
  const currentUser = useAppSelector((state) => state.auth.user)

  const commentError = addComment.error
    ? friendlyCommentsError(addComment.error)
    : null

  function handlePost(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = commentBody.trim()
    if (!trimmed) return
    addComment.mutate(trimmed, {
      onSuccess: () => {
        setCommentBody('')
      },
    })
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-xl font-bold tracking-tight text-slate-900">
          Comments
        </h2>
        {comments && (
          <span
            aria-label={`${comments.length} comments`}
            className="text-sm font-semibold text-slate-500"
          >
            {comments.length}
          </span>
        )}
      </div>

      {/* Comment list */}
      {isLoading && (
        <div className="mt-4 flex justify-center">
          <span
            className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
            aria-label="Loading comments"
            role="status"
          />
        </div>
      )}

      {!isLoading && error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error.message}
        </p>
      )}

      {!isLoading && !error && comments && comments.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No comments yet.</p>
      )}

      {!isLoading && !error && comments && comments.length > 0 && (
        <ul className="mt-4 space-y-3">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              ticketId={ticketId}
              isOwn={Boolean(currentUser && comment.author.id === currentUser.id)}
            />
          ))}
        </ul>
      )}

      {/* Add comment form */}
      <form className="mt-6" onSubmit={handlePost}>
        <Textarea
          label="Add comment"
          rows={3}
          placeholder="Write a comment…"
          value={commentBody}
          onChange={(e) => setCommentBody(e.target.value)}
          aria-describedby={commentError ? 'comment-error' : undefined}
        />
        {commentError && (
          <p id="comment-error" role="alert" className="mt-1 text-sm text-red-600">
            {commentError}
          </p>
        )}
        <div className="mt-3 flex justify-end">
          <Button
            type="submit"
            disabled={addComment.isPending || commentBody.trim() === ''}
          >
            {addComment.isPending ? 'Posting…' : 'Post comment'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: ticket, isLoading, error } = useTicket(id)
  const updateTicket = useUpdateTicket(id ?? '')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // formValues is initialized from the loaded ticket (see effect below).
  const [formValues, setFormValues] = useState<TicketFormValues | null>(null)

  // Once the ticket loads, seed the form — but don't overwrite local edits on
  // background refetches (only initialize when formValues is still null).
  if (ticket && formValues === null) {
    setFormValues({
      team_id: ticket.team_id,
      type: ticket.type,
      state: ticket.state,
      epic_id: ticket.epic_id,
      title: ticket.title,
      body: ticket.body,
    })
  }

  const saveError = updateTicket.error
    ? friendlyTicketsError(updateTicket.error)
    : null

  // Save is enabled only when the form differs from the loaded ticket AND the
  // required fields are non-blank. Prevents no-op saves and invalid submits.
  const isDirty =
    !!formValues &&
    !!ticket &&
    (formValues.team_id !== ticket.team_id ||
      formValues.type !== ticket.type ||
      formValues.state !== ticket.state ||
      (formValues.epic_id ?? null) !== (ticket.epic_id ?? null) ||
      formValues.title.trim() !== ticket.title ||
      formValues.body.trim() !== ticket.body)

  const isValid =
    !!formValues &&
    formValues.title.trim() !== '' &&
    formValues.body.trim() !== ''

  const canSave = isDirty && isValid && !updateTicket.isPending

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!formValues || !ticket) return

    updateTicket.mutate({
      team_id: formValues.team_id,
      type: formValues.type,
      state: formValues.state,
      epic_id: formValues.epic_id,
      title: formValues.title.trim(),
      body: formValues.body.trim(),
    })
  }

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <span
          className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
          aria-label="Loading ticket"
          role="status"
        />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  if (error || !ticket) {
    return (
      <div className="py-8 text-center">
        <p role="alert" className="text-sm text-red-600">
          {error?.message ?? 'Ticket not found.'}
        </p>
        <Link
          to="/board"
          className="mt-4 inline-block text-sm font-bold text-slate-900 hover:underline"
        >
          ← Back to board
        </Link>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Loaded
  // ---------------------------------------------------------------------------

  return (
    <>
      <div className="space-y-4">
        <Link
          to="/board"
          className="inline-block text-sm font-bold text-slate-900 hover:underline"
        >
          ← Back to board
        </Link>

        {/* Header meta */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            TCK-{ticket.number}
            <span aria-hidden="true" className="mx-2">•</span>
            Created by {emailLocalPart(ticket.created_by.email)}
            <span aria-hidden="true" className="mx-2">•</span>
            Created {formatTimestamp(ticket.created_at)}
            <span aria-hidden="true" className="mx-2">•</span>
            {/* Modified reflects ticket saves only, NOT comment additions */}
            Modified {formatTimestamp(ticket.modified_at)}
          </p>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete
            </Button>
            <Button
              type="submit"
              form="ticket-edit-form"
              disabled={!canSave}
            >
              {updateTicket.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>

        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          {ticket.title}
        </h1>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: form */}
          <Card className="p-6 lg:col-span-2">
            <form
              id="ticket-edit-form"
              onSubmit={handleSave}
            >
              {formValues && (
                <TicketForm
                  values={formValues}
                  mode="edit"
                  errorMessage={saveError}
                  onChange={setFormValues}
                />
              )}
            </form>
          </Card>

          {/* Right: comments */}
          {id && <CommentsPanel ticketId={id} />}
        </div>
      </div>

      {/* Delete confirmation overlay */}
      {showDeleteConfirm && id && (
        <DeleteConfirm
          ticketId={id}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  )
}
