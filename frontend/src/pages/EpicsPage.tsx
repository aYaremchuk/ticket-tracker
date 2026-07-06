/**
 * Epics management screen — M3: wired to the real API.
 *
 * Layout (wireframe 5):
 *   - Team selector (top) — populated from useTeams(); defaults to first team;
 *     selection persisted in URL via ?team=<id>.
 *   - Left 3/5: epic list for the selected team — title, description, ticket
 *     count, modified date. Loading / empty / error states.
 *   - Right 2/5: side panel — "Create epic" form or "Edit epic" form depending
 *     on active panel state (none / create / edit).
 *
 * Rules applied:
 *   - Strict TS, Tailwind only, reuse ui/ primitives.
 *   - Delete disabled when ticket_count > 0; confirmation required.
 *   - 409 epic_has_tickets shown as inline error in the confirmation.
 *   - 422 validation shown inline in the create/edit forms.
 */

import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/Button.tsx'
import { Card } from '../components/ui/Card.tsx'
import { Select } from '../components/ui/Select.tsx'
import { TextInput } from '../components/ui/TextInput.tsx'
import { Textarea } from '../components/ui/Textarea.tsx'
import {
  friendlyEpicsError,
  useCreateEpic,
  useDeleteEpic,
  useEpics,
  useUpdateEpic,
} from '../hooks/useEpics.ts'
import { useTeams } from '../hooks/useTeams.ts'
import type { Epic } from '../types/api.ts'

const DELETE_NOTE = 'Delete is disabled while tickets reference the epic.'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatModified(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / 86_400_000)

  if (diffDays === 0) {
    return `Today ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ---------------------------------------------------------------------------
// Panel state discriminated union
// ---------------------------------------------------------------------------

type PanelState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; epic: Epic }
  | { kind: 'delete'; epic: Epic }

// ---------------------------------------------------------------------------
// Create panel
// ---------------------------------------------------------------------------

interface CreatePanelProps {
  teamId: string
  onClose: () => void
}

function CreatePanel({ teamId, onClose }: CreatePanelProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const createEpic = useCreateEpic(teamId)

  const errorMessage = createEpic.error ? friendlyEpicsError(createEpic.error) : null

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    createEpic.mutate(
      { title: title.trim(), description: description.trim() || null },
      { onSuccess: onClose },
    )
  }

  return (
    <Card className="self-start p-6 lg:col-span-2">
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">
        Create epic
      </h2>
      <form className="mt-4 space-y-5" onSubmit={handleSubmit}>
        <TextInput
          label="Title"
          placeholder="e.g. Checkout reliability"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          aria-describedby={errorMessage ? 'create-epic-error' : undefined}
        />
        <Textarea
          label="Description (optional)"
          rows={5}
          placeholder="What is this epic about?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {errorMessage && (
          <p id="create-epic-error" role="alert" className="text-sm text-red-600">
            {errorMessage}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={createEpic.isPending}>
            {createEpic.isPending ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Edit panel
// ---------------------------------------------------------------------------

interface EditPanelProps {
  epic: Epic
  teamId: string
  onClose: () => void
}

function EditPanel({ epic, teamId, onClose }: EditPanelProps) {
  const [title, setTitle] = useState(epic.title)
  const [description, setDescription] = useState(epic.description ?? '')
  const updateEpic = useUpdateEpic(teamId)

  const errorMessage = updateEpic.error ? friendlyEpicsError(updateEpic.error) : null

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    updateEpic.mutate(
      { id: epic.id, title: title.trim(), description: description.trim() || null },
      { onSuccess: onClose },
    )
  }

  return (
    <Card className="self-start p-6 lg:col-span-2">
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">
        Edit epic
      </h2>
      <form className="mt-4 space-y-5" onSubmit={handleSubmit}>
        {/* team_id is immutable — not shown */}
        <TextInput
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          aria-describedby={errorMessage ? 'edit-epic-error' : undefined}
        />
        <Textarea
          label="Description (optional)"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {errorMessage && (
          <p id="edit-epic-error" role="alert" className="text-sm text-red-600">
            {errorMessage}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={updateEpic.isPending}>
            {updateEpic.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Delete confirmation panel (inline in the side-panel slot)
// ---------------------------------------------------------------------------

interface DeleteConfirmPanelProps {
  epic: Epic
  teamId: string
  onClose: () => void
}

function DeleteConfirmPanel({ epic, teamId, onClose }: DeleteConfirmPanelProps) {
  const deleteEpic = useDeleteEpic(teamId)

  const errorMessage = deleteEpic.error ? friendlyEpicsError(deleteEpic.error) : null

  function handleConfirm() {
    deleteEpic.mutate(epic.id, { onSuccess: onClose })
  }

  return (
    <Card className="self-start p-6 lg:col-span-2">
      <h2 className="text-2xl font-bold tracking-tight text-slate-900">
        Delete epic
      </h2>
      <div className="mt-4 space-y-4">
        <p className="text-sm text-slate-700">
          Are you sure you want to delete{' '}
          <span className="font-semibold">{epic.title}</span>? This action
          cannot be undone.
        </p>
        {errorMessage && (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleConfirm}
            disabled={deleteEpic.isPending}
          >
            {deleteEpic.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Epic list states
// ---------------------------------------------------------------------------

function ListLoadingState() {
  return (
    <tr>
      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
        <span
          className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
          aria-label="Loading epics"
          role="status"
        />
      </td>
    </tr>
  )
}

function ListErrorState({ message }: { message: string }) {
  return (
    <tr>
      <td colSpan={4} className="px-4 py-8 text-center">
        <p role="alert" className="text-sm text-red-600">
          {message}
        </p>
      </td>
    </tr>
  )
}

function ListEmptyState() {
  return (
    <tr>
      <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
        No epics for this team.
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function EpicsPage() {
  const { data: teams, isLoading: teamsLoading } = useTeams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [panel, setPanel] = useState<PanelState>({ kind: 'none' })

  // Derive selected team: prefer ?team= param, then first loaded team.
  const paramTeamId = searchParams.get('team') ?? undefined
  const firstTeamId = teams?.[0]?.id
  const selectedTeamId = paramTeamId ?? firstTeamId

  function handleTeamChange(teamId: string) {
    setSearchParams({ team: teamId }, { replace: true })
    // Close any open panel when switching teams.
    setPanel({ kind: 'none' })
  }

  const {
    data: epics,
    isLoading: epicsLoading,
    error: epicsError,
  } = useEpics(selectedTeamId)

  function closePanel() {
    setPanel({ kind: 'none' })
  }

  const showPanel = panel.kind !== 'none'

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        Epics
      </h1>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        {teamsLoading ? (
          <div className="h-10 w-64 animate-pulse rounded-lg bg-slate-200" aria-label="Loading teams" />
        ) : (
          <Select
            label="Team"
            className="w-full sm:w-64"
            value={selectedTeamId ?? ''}
            onChange={(e) => handleTeamChange(e.target.value)}
            disabled={!teams || teams.length === 0}
            aria-label="Select team"
          >
            {teams?.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
            {(!teams || teams.length === 0) && (
              <option value="">No teams available</option>
            )}
          </Select>
        )}
        <Button
          onClick={() => setPanel({ kind: 'create' })}
          disabled={!selectedTeamId}
        >
          + Create epic
        </Button>
      </div>

      {/* Grid: list (3/5) + side panel (2/5) when panel open */}
      <div
        className={`mt-6 grid grid-cols-1 gap-6 ${showPanel ? 'lg:grid-cols-5' : ''}`}
      >
        {/* Epic list */}
        <Card
          className={`overflow-hidden ${showPanel ? 'lg:col-span-3' : ''}`}
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-900">
                <th scope="col" className="px-4 py-3 font-bold">
                  Title
                </th>
                <th scope="col" className="px-4 py-3 font-bold">
                  Tickets
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
              {epicsLoading && <ListLoadingState />}

              {!epicsLoading && epicsError && (
                <ListErrorState
                  message={
                    epicsError instanceof Error
                      ? epicsError.message
                      : 'Failed to load epics.'
                  }
                />
              )}

              {!epicsLoading && !epicsError && !selectedTeamId && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                    Select a team to view its epics.
                  </td>
                </tr>
              )}

              {!epicsLoading && !epicsError && selectedTeamId && epics && epics.length === 0 && (
                <ListEmptyState />
              )}

              {!epicsLoading &&
                !epicsError &&
                epics &&
                epics.map((epic) => {
                  const referenced = epic.ticket_count > 0
                  const isEditingThis =
                    panel.kind === 'edit' && panel.epic.id === epic.id
                  const isDeletingThis =
                    panel.kind === 'delete' && panel.epic.id === epic.id

                  return (
                    <tr
                      key={epic.id}
                      className={
                        isEditingThis || isDeletingThis
                          ? 'bg-slate-50'
                          : undefined
                      }
                    >
                      <td className="px-4 py-4">
                        <p className="font-bold text-slate-900">{epic.title}</p>
                        {epic.description && (
                          <p className="mt-1 text-slate-500">{epic.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {epic.ticket_count}
                      </td>
                      <td className="px-4 py-4 text-slate-500">
                        {formatModified(epic.modified_at)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setPanel({ kind: 'edit', epic })}
                            aria-label={`Edit ${epic.title}`}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={referenced}
                            title={referenced ? DELETE_NOTE : undefined}
                            aria-label={`Delete ${epic.title}`}
                            onClick={() =>
                              !referenced && setPanel({ kind: 'delete', epic })
                            }
                          >
                            ×
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

        {/* Side panel — create / edit / delete confirm */}
        {panel.kind === 'create' && selectedTeamId && (
          <CreatePanel teamId={selectedTeamId} onClose={closePanel} />
        )}
        {panel.kind === 'edit' && selectedTeamId && (
          <EditPanel epic={panel.epic} teamId={selectedTeamId} onClose={closePanel} />
        )}
        {panel.kind === 'delete' && selectedTeamId && (
          <DeleteConfirmPanel epic={panel.epic} teamId={selectedTeamId} onClose={closePanel} />
        )}
      </div>
    </div>
  )
}
