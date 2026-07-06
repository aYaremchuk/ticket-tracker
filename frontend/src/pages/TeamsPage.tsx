/**
 * Teams management screen — M2: wired to the real API.
 *
 * - List loaded via useTeams() (TanStack Query).
 * - Create: modal → useCreateTeam; inline 422 (blank) + 409 (duplicate) errors.
 * - Edit:   modal pre-filled with current name → useUpdateTeam; same errors.
 * - Delete: confirmation dialog → useDeleteTeam; disabled when team has tickets/epics.
 * - All states: loading spinner, error banner, empty message.
 */

import { useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { Card } from '../components/ui/Card.tsx'
import { Modal } from '../components/ui/Modal.tsx'
import { TextInput } from '../components/ui/TextInput.tsx'
import {
  friendlyTeamsError,
  useCreateTeam,
  useDeleteTeam,
  useTeams,
  useUpdateTeam,
} from '../hooks/useTeams.ts'
import type { Team } from '../types/api.ts'

const DELETE_NOTE = 'Delete is disabled while a team contains tickets or epics.'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatModified(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffDays === 0) {
    // Same calendar day — show time
    return `Today ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// Loading / Error / Empty state components
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <tr>
      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
        <span
          className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
          aria-label="Loading teams"
          role="status"
        />
      </td>
    </tr>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <tr>
      <td colSpan={5} className="px-4 py-8 text-center">
        <p role="alert" className="text-sm text-red-600">
          {message}
        </p>
      </td>
    </tr>
  )
}

function EmptyState() {
  return (
    <tr>
      <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">
        No teams yet. Create one to get started.
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Create modal
// ---------------------------------------------------------------------------

interface CreateModalProps {
  onClose: () => void
}

function CreateModal({ onClose }: CreateModalProps) {
  const [name, setName] = useState('')
  const createTeam = useCreateTeam()

  const errorMessage = createTeam.error ? friendlyTeamsError(createTeam.error) : null

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = name.trim()
    createTeam.mutate(trimmed, {
      onSuccess: () => {
        onClose()
      },
    })
  }

  return (
    <Modal title="Create team" onClose={onClose}>
      <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit}>
        <TextInput
          label="Team name"
          placeholder="e.g. Platform Engineering"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          aria-describedby={errorMessage ? 'create-error' : undefined}
        />
        {errorMessage && (
          <p id="create-error" role="alert" className="text-sm text-red-600">
            {errorMessage}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createTeam.isPending}>
            {createTeam.isPending ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Edit modal
// ---------------------------------------------------------------------------

interface EditModalProps {
  team: Team
  onClose: () => void
}

function EditModal({ team, onClose }: EditModalProps) {
  const [name, setName] = useState(team.name)
  const updateTeam = useUpdateTeam()

  const errorMessage = updateTeam.error ? friendlyTeamsError(updateTeam.error) : null

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = name.trim()
    updateTeam.mutate(
      { id: team.id, name: trimmed },
      {
        onSuccess: () => {
          onClose()
        },
      },
    )
  }

  return (
    <Modal title="Rename team" onClose={onClose}>
      <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit}>
        <TextInput
          label="Team name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          aria-describedby={errorMessage ? 'edit-error' : undefined}
        />
        {errorMessage && (
          <p id="edit-error" role="alert" className="text-sm text-red-600">
            {errorMessage}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateTeam.isPending}>
            {updateTeam.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Delete confirmation dialog
// ---------------------------------------------------------------------------

interface DeleteDialogProps {
  team: Team
  onClose: () => void
}

function DeleteDialog({ team, onClose }: DeleteDialogProps) {
  const deleteTeam = useDeleteTeam()

  const errorMessage = deleteTeam.error ? friendlyTeamsError(deleteTeam.error) : null

  function handleConfirm() {
    deleteTeam.mutate(team.id, {
      onSuccess: () => {
        onClose()
      },
    })
  }

  return (
    <Modal title="Delete team" onClose={onClose}>
      <div className="mt-4 flex flex-col gap-4">
        <p className="text-sm text-slate-700">
          Are you sure you want to delete{' '}
          <span className="font-semibold">{team.name}</span>? This action
          cannot be undone.
        </p>
        {errorMessage && (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleConfirm}
            disabled={deleteTeam.isPending}
          >
            {deleteTeam.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type ModalState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; team: Team }
  | { kind: 'delete'; team: Team }

export function TeamsPage() {
  const { data: teams, isLoading, error } = useTeams()
  const [modal, setModal] = useState<ModalState>({ kind: 'none' })

  function closeModal() {
    setModal({ kind: 'none' })
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Teams
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            All verified users can view and manage all teams.
          </p>
        </div>
        <Button onClick={() => setModal({ kind: 'create' })}>
          + Create team
        </Button>
      </div>

      <Card className="mt-6 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-900">
              <th scope="col" className="px-4 py-3 font-bold">
                Name
              </th>
              <th scope="col" className="px-4 py-3 font-bold">
                Tickets
              </th>
              <th scope="col" className="px-4 py-3 font-bold">
                Epics
              </th>
              <th scope="col" className="px-4 py-3 font-bold">
                Modified
              </th>
              <th scope="col" className="px-4 py-3 text-right font-bold">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {isLoading && <LoadingState />}

            {!isLoading && error && (
              <ErrorState
                message={
                  error instanceof Error
                    ? error.message
                    : 'Failed to load teams.'
                }
              />
            )}

            {!isLoading && !error && teams && teams.length === 0 && (
              <EmptyState />
            )}

            {!isLoading &&
              !error &&
              teams &&
              teams.map((team) => {
                const referenced = team.ticket_count + team.epic_count > 0
                return (
                  <tr key={team.id}>
                    <td className="px-4 py-4 font-bold text-slate-900">
                      {team.name}
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {team.ticket_count}
                    </td>
                    <td className="px-4 py-4 text-slate-700">
                      {team.epic_count}
                    </td>
                    <td className="px-4 py-4 text-slate-500">
                      {formatModified(team.modified_at)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setModal({ kind: 'edit', team })}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={referenced}
                          title={referenced ? DELETE_NOTE : undefined}
                          onClick={() =>
                            !referenced && setModal({ kind: 'delete', team })
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
        <p className="border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
          {DELETE_NOTE}
        </p>
      </Card>

      {modal.kind === 'create' && <CreateModal onClose={closeModal} />}
      {modal.kind === 'edit' && (
        <EditModal team={modal.team} onClose={closeModal} />
      )}
      {modal.kind === 'delete' && (
        <DeleteDialog team={modal.team} onClose={closeModal} />
      )}
    </div>
  )
}
