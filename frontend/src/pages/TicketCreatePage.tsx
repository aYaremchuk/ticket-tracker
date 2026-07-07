/**
 * Ticket create screen.
 *
 * Renders TicketForm in 'create' mode (state field hidden).
 * On save: POST via useCreateTicket, navigate to /tickets/:id on 201.
 * 422 / epic_team_mismatch inline errors surfaced via friendlyTicketsError.
 *
 * State design: all form state lives here (fully controlled). Teams are loaded
 * async; when they arrive we auto-select the first team via a useEffect so the
 * Epic select is immediately active.
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button.tsx'
import { Card } from '../components/ui/Card.tsx'
import { TicketForm } from '../components/TicketForm.tsx'
import { ApiError } from '../api/client.ts'
import { friendlyTicketsError, useCreateTicket } from '../hooks/useTickets.ts'
import { useTeams } from '../hooks/useTeams.ts'
import type { TicketFormValues } from '../components/TicketForm.tsx'

const INITIAL_VALUES: TicketFormValues = {
  team_id: '',
  type: 'feature',
  state: 'new', // not sent on create; satisfies the type
  epic_id: null,
  title: '',
  body: '',
}

export function TicketCreatePage() {
  const navigate = useNavigate()
  const createTicket = useCreateTicket()
  const { data: teams } = useTeams()

  const [formValues, setFormValues] = useState<TicketFormValues>(INITIAL_VALUES)

  // Auto-select the first team when teams load (only if no team is chosen yet).
  useEffect(() => {
    const firstTeamId = teams?.[0]?.id
    if (firstTeamId && !formValues.team_id) {
      setFormValues((prev) => ({ ...prev, team_id: firstTeamId }))
    }
  }, [teams, formValues.team_id])

  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<'title' | 'body', string>>
  >({})

  const errorMessage = createTicket.error
    ? friendlyTicketsError(createTicket.error)
    : null

  // Clear field errors as the user edits (they re-appear on the next submit).
  function handleChange(values: TicketFormValues) {
    setFormValues(values)
    if (Object.keys(fieldErrors).length > 0) setFieldErrors({})
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const { team_id, type, epic_id, title, body } = formValues

    // Client-side required-field validation → inline errors near each field.
    const errs: Partial<Record<'title' | 'body', string>> = {}
    if (title.trim() === '') errs.title = "Title can't be blank"
    if (body.trim() === '') errs.body = "Body can't be blank"
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) return

    createTicket.mutate(
      {
        team_id,
        type,
        title: title.trim(),
        body: body.trim(),
        epic_id: epic_id ?? undefined,
      },
      {
        onSuccess: (ticket) => {
          void navigate(`/tickets/${ticket.id}`)
        },
        onError: (err) => {
          // Map any server-side field validation (422 details) near the fields.
          const details = err instanceof ApiError ? err.details : undefined
          if (details) {
            setFieldErrors({
              title: details.title?.[0],
              body: details.body?.[0],
            })
          }
        },
      },
    )
  }

  return (
    <div className="space-y-4">
      <Link
        to="/board"
        className="inline-block text-sm font-bold text-slate-900 hover:underline"
      >
        ← Back to board
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          New ticket
        </h1>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => void navigate('/board')}
            disabled={createTicket.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="ticket-create-form"
            disabled={createTicket.isPending}
          >
            {createTicket.isPending ? 'Creating…' : 'Create ticket'}
          </Button>
        </div>
      </div>

      <Card className="p-6">
        <form
          id="ticket-create-form"
          onSubmit={handleSubmit}
        >
          <TicketForm
            values={formValues}
            mode="create"
            errorMessage={errorMessage}
            fieldErrors={fieldErrors}
            onChange={handleChange}
          />
        </form>
      </Card>
    </div>
  )
}
