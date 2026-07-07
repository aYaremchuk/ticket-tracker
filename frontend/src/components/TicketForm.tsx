/**
 * TicketForm — shared fully-controlled form used by TicketCreatePage and
 * TicketDetailPage.
 *
 * Fully controlled: the parent owns all field state and passes it down via
 * `values`. The form calls `onChange` with a complete updated copy whenever
 * any field changes. This avoids stale-closure issues when the parent needs to
 * seed the form asynchronously (e.g. after teams load).
 *
 * Responsibilities:
 *  - Team select (from useTeams); team change clears epic_id.
 *  - Type select (TICKET_TYPE_LABELS).
 *  - State select (TICKET_STATE_LABELS) — hidden in 'create' mode.
 *  - Epic select (from useEpics(team_id)), scoped to selected team; "No epic" option.
 *  - Title TextInput and Body Textarea.
 *  - Inline error display (epic_team_mismatch, validation_error, etc.).
 */

import { Select } from './ui/Select.tsx'
import { TextInput } from './ui/TextInput.tsx'
import { Textarea } from './ui/Textarea.tsx'
import { useEpics } from '../hooks/useEpics.ts'
import { useTeams } from '../hooks/useTeams.ts'
import {
  TICKET_STATES,
  TICKET_STATE_LABELS,
  TICKET_TYPES,
  TICKET_TYPE_LABELS,
} from '../types/api.ts'
import type { TicketState, TicketType } from '../types/api.ts'

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

export interface TicketFormValues {
  team_id: string
  type: TicketType
  state: TicketState
  epic_id: string | null // null = "No epic"
  title: string
  body: string
}

interface TicketFormProps {
  /** Current field values (fully controlled by the parent). */
  values: TicketFormValues
  /** 'create' hides the State field; 'edit' shows it. */
  mode: 'create' | 'edit'
  /** Inline error message to display (e.g. epic_team_mismatch). */
  errorMessage?: string | null
  /** Per-field validation errors shown beneath the relevant input. */
  fieldErrors?: Partial<Record<'title' | 'body', string>>
  /** Called when any field changes with the updated value set. */
  onChange: (values: TicketFormValues) => void
}

export function TicketForm({
  values,
  mode,
  errorMessage,
  fieldErrors,
  onChange,
}: TicketFormProps) {
  const { data: teams } = useTeams()
  // Epics are scoped to the currently selected team.
  const { data: epics } = useEpics(values.team_id || undefined)

  function handleTeamChange(teamId: string) {
    // Changing the team must clear the epic — per contract, the epic must belong
    // to the selected team. Re-fetching epics happens automatically via useEpics.
    onChange({ ...values, team_id: teamId, epic_id: null })
  }

  function handleField<K extends keyof TicketFormValues>(
    key: K,
    value: TicketFormValues[K],
  ) {
    onChange({ ...values, [key]: value })
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Team */}
        <Select
          label="Team"
          value={values.team_id}
          onChange={(e) => handleTeamChange(e.target.value)}
          disabled={!teams || teams.length === 0}
          aria-required="true"
        >
          {!values.team_id && <option value="">Select a team…</option>}
          {teams?.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </Select>

        {/* Type */}
        <Select
          label="Type"
          value={values.type}
          onChange={(e) => handleField('type', e.target.value as TicketType)}
          aria-required="true"
        >
          {TICKET_TYPES.map((t) => (
            <option key={t} value={t}>
              {TICKET_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>

        {/* State — hidden on create (server defaults to "new") */}
        {mode === 'edit' && (
          <Select
            label="State"
            value={values.state}
            onChange={(e) =>
              handleField('state', e.target.value as TicketState)
            }
          >
            {TICKET_STATES.map((s) => (
              <option key={s} value={s}>
                {TICKET_STATE_LABELS[s]}
              </option>
            ))}
          </Select>
        )}
      </div>

      {/* Epic — options scoped to selected team */}
      <Select
        label="Epic"
        value={values.epic_id ?? ''}
        onChange={(e) =>
          handleField('epic_id', e.target.value || null)
        }
        disabled={!values.team_id}
      >
        <option value="">No epic</option>
        {epics?.map((epic) => (
          <option key={epic.id} value={epic.id}>
            {epic.title}
          </option>
        ))}
      </Select>

      {/* Title */}
      <div>
        <TextInput
          label="Title"
          value={values.title}
          onChange={(e) => handleField('title', e.target.value)}
          placeholder="Short summary of the ticket"
          aria-required="true"
          aria-invalid={fieldErrors?.title ? true : undefined}
          aria-describedby={fieldErrors?.title ? 'title-error' : undefined}
        />
        {fieldErrors?.title && (
          <p id="title-error" role="alert" className="mt-1 text-sm text-red-600">
            {fieldErrors.title}
          </p>
        )}
      </div>

      {/* Body */}
      <div>
        <Textarea
          label="Body"
          rows={8}
          value={values.body}
          onChange={(e) => handleField('body', e.target.value)}
          placeholder="Describe the ticket in detail…"
          aria-required="true"
          aria-invalid={fieldErrors?.body ? true : undefined}
          aria-describedby={fieldErrors?.body ? 'body-error' : undefined}
        />
        {fieldErrors?.body && (
          <p id="body-error" role="alert" className="mt-1 text-sm text-red-600">
            {fieldErrors.body}
          </p>
        )}
      </div>

      {/* Inline error from parent (epic_team_mismatch, validation_error, etc.) */}
      {errorMessage && (
        <p role="alert" className="text-sm text-red-600">
          {errorMessage}
        </p>
      )}
    </div>
  )
}
