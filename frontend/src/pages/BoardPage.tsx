/**
 * Kanban board (M5).
 *
 * Architecture notes:
 * - URL owns all board state (?team, ?type, ?epic, ?q) so the view is
 *   shareable and survives refresh. React Router is the source of truth;
 *   the search box keeps a local mirror only for the 300 ms debounce.
 * - TanStack Query owns server state. Columns are derived (memoized) from the
 *   single GET /api/tickets response — the API already sorts modified_at DESC,
 *   so per-column order falls out of a stable group-by.
 * - Drag-and-drop = dnd-kit. Cards are draggable, the 5 state columns are
 *   droppable. Drops PATCH {state} optimistically with rollback + toast on
 *   failure (see useUpdateTicketState / dragdrop-rollback skill).
 * - Click vs drag: PointerSensor has an 8 px activation distance, so plain
 *   clicks never start a drag and simply navigate to the ticket. Keyboard
 *   users get a dedicated per-card "Move" handle (KeyboardSensor activator)
 *   plus the title link for navigation — no Enter-key conflict.
 * - Perf: columns and cards are React.memo'd; epic titles resolve through a
 *   memoized Map; search is debounced so we never fetch per keystroke.
 */

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type {
  Announcements,
  ClientRect,
  DragEndEvent,
  DragStartEvent,
  KeyboardCoordinateGetter,
  ScreenReaderInstructions,
} from '@dnd-kit/core'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CountBadge, TypeBadge } from '../components/ui/Badge'
import { Button, LinkButton } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { TextInput } from '../components/ui/TextInput'
import { Toast } from '../components/ui/Toast'
import { useEpics } from '../hooks/useEpics'
import { useTeams } from '../hooks/useTeams'
import { useTickets, useUpdateTicketState } from '../hooks/useTickets'
import {
  TICKET_STATES,
  TICKET_STATE_LABELS,
  TICKET_TYPES,
  TICKET_TYPE_LABELS,
} from '../types/api'
import type {
  Ticket,
  TicketFilters,
  TicketState,
  TicketType,
} from '../types/api'
import { relativeTimeFromNow } from '../utils/relativeTime'

const SEARCH_DEBOUNCE_MS = 300

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseTicketType(value: string | null): TicketType | undefined {
  return TICKET_TYPES.includes(value as TicketType)
    ? (value as TicketType)
    : undefined
}

/**
 * Keyboard drag: ArrowLeft/ArrowRight jump the lifted card between column
 * rects (instead of dnd-kit's default 25 px nudges), so a keyboard move is
 * one keypress per column. Up/Down are ignored — order within a column is
 * server-controlled (modified_at DESC), only the column can change.
 */
const boardKeyboardCoordinates: KeyboardCoordinateGetter = (
  event,
  { currentCoordinates, context: { collisionRect, droppableRects } },
) => {
  if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight') return
  if (!collisionRect) return
  event.preventDefault()

  const columns = TICKET_STATES.map((state) => ({
    state,
    rect: droppableRects.get(state),
  })).filter((c): c is { state: TicketState; rect: ClientRect } =>
    Boolean(c.rect),
  )
  if (columns.length === 0) return

  // Find the column the card currently hovers (closest center on the x axis).
  const centerX = collisionRect.left + collisionRect.width / 2
  let currentIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  columns.forEach((column, index) => {
    const distance = Math.abs(
      column.rect.left + column.rect.width / 2 - centerX,
    )
    if (distance < bestDistance) {
      bestDistance = distance
      currentIndex = index
    }
  })

  const nextIndex =
    event.code === 'ArrowRight'
      ? Math.min(currentIndex + 1, columns.length - 1)
      : Math.max(currentIndex - 1, 0)
  if (nextIndex === currentIndex) return

  const target = columns[nextIndex]?.rect
  if (!target) return
  return {
    x: target.left + target.width / 2 - collisionRect.width / 2,
    y: currentCoordinates.y,
  }
}

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    'To pick up a ticket, press Enter or Space on its Move button. While ' +
    'lifted, use the left and right arrow keys to choose a column, press ' +
    'Enter or Space to drop, or press Escape to cancel.',
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function BoardPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: teams, isLoading: teamsLoading } = useTeams()

  // --- URL-driven state -----------------------------------------------------
  const paramTeamId = searchParams.get('team')
  const typeFilter = parseTicketType(searchParams.get('type'))
  const epicParam = searchParams.get('epic')
  const qParam = searchParams.get('q') ?? ''

  // Selected team: valid ?team= param wins, else the first team (name ASC).
  const selectedTeamId =
    teams?.find((t) => t.id === paramTeamId)?.id ?? teams?.[0]?.id

  const updateParams = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(patch)) {
            if (value) next.set(key, value)
            else next.delete(key)
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  // Backfill ?team= once teams load so the default board URL is shareable.
  useEffect(() => {
    if (selectedTeamId && paramTeamId !== selectedTeamId) {
      updateParams({ team: selectedTeamId })
    }
  }, [selectedTeamId, paramTeamId, updateParams])

  // --- Debounced search (local mirror → URL after 300 ms) --------------------
  const [searchInput, setSearchInput] = useState(qParam)
  useEffect(() => {
    // External URL changes (Clear button, back/forward) re-sync the input.
    setSearchInput(qParam)
  }, [qParam])
  useEffect(() => {
    if (searchInput === qParam) return
    const timer = setTimeout(
      () => updateParams({ q: searchInput || null }),
      SEARCH_DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [searchInput, qParam, updateParams])

  // --- Server state -----------------------------------------------------------
  const filters = useMemo<Partial<TicketFilters> | undefined>(
    () =>
      selectedTeamId
        ? {
            team_id: selectedTeamId,
            ...(typeFilter ? { type: typeFilter } : {}),
            ...(epicParam ? { epic_id: epicParam } : {}),
            ...(qParam ? { q: qParam } : {}),
          }
        : undefined,
    [selectedTeamId, typeFilter, epicParam, qParam],
  )

  const {
    data,
    isLoading: ticketsLoading,
    isError,
    error,
    refetch,
    isPlaceholderData,
  } = useTickets(filters, { enabled: Boolean(selectedTeamId) })

  const { data: epics } = useEpics(selectedTeamId)
  const epicTitleById = useMemo(
    () => new Map((epics ?? []).map((e) => [e.id, e.title])),
    [epics],
  )

  const tickets = data?.tickets
  const columns = useMemo(() => {
    const byState = new Map<TicketState, Ticket[]>(
      TICKET_STATES.map((state) => [state, []]),
    )
    for (const ticket of tickets ?? []) byState.get(ticket.state)?.push(ticket)
    return byState
  }, [tickets])
  const ticketsById = useMemo(
    () => new Map((tickets ?? []).map((t) => [t.id, t])),
    [tickets],
  )

  // --- Drag-and-drop ----------------------------------------------------------
  const [toast, setToast] = useState<string | null>(null)
  const dismissToast = useCallback(() => setToast(null), [])
  const moveTicket = useUpdateTicketState(filters, setToast)
  const { mutate: moveTicketMutate } = moveTicket

  const sensors = useSensors(
    // 8 px activation distance: a plain click never lifts the card, so
    // click-to-open keeps working on the same element.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: boardKeyboardCoordinates }),
  )

  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null)
  // Suppresses the synthetic click that lands right after a pointer drop —
  // otherwise finishing a drag would also navigate to the ticket.
  const recentDragRef = useRef(false)

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      recentDragRef.current = true
      setActiveTicket(ticketsById.get(String(event.active.id)) ?? null)
    },
    [ticketsById],
  )

  const finishDrag = useCallback(() => {
    setActiveTicket(null)
    // The click event fires synchronously after pointerup; clear on next tick.
    setTimeout(() => {
      recentDragRef.current = false
    }, 0)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      finishDrag()
      const { active, over } = event
      if (!over) return
      const targetState = over.id as TicketState
      const sourceState = ticketsById.get(String(active.id))?.state
      if (!sourceState || sourceState === targetState) return
      moveTicketMutate({ id: String(active.id), state: targetState })
    },
    [finishDrag, ticketsById, moveTicketMutate],
  )

  const openTicket = useCallback(
    (id: string) => {
      if (recentDragRef.current) return
      navigate(`/tickets/${id}`)
    },
    [navigate],
  )

  const announcements = useMemo<Announcements>(() => {
    const titleOf = (id: unknown) =>
      ticketsById.get(String(id))?.title ?? 'ticket'
    const labelOf = (id: unknown) =>
      TICKET_STATE_LABELS[id as TicketState] ?? String(id)
    return {
      onDragStart: ({ active }) => `Picked up ticket "${titleOf(active.id)}".`,
      onDragOver: ({ active, over }) =>
        over
          ? `Ticket "${titleOf(active.id)}" is over the ${labelOf(over.id)} column.`
          : `Ticket "${titleOf(active.id)}" is no longer over a column.`,
      onDragEnd: ({ active, over }) =>
        over
          ? `Ticket "${titleOf(active.id)}" was dropped into the ${labelOf(over.id)} column.`
          : `Ticket "${titleOf(active.id)}" was dropped.`,
      onDragCancel: ({ active }) =>
        `Moving ticket "${titleOf(active.id)}" was cancelled.`,
    }
  }, [ticketsById])

  // --- Render -----------------------------------------------------------------
  const hasFilters = Boolean(typeFilter || epicParam || qParam || searchInput)
  const showSkeleton = teamsLoading || (Boolean(selectedTeamId) && ticketsLoading)
  const noTeams = !teamsLoading && (teams?.length ?? 0) === 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {teamsLoading ? (
          <div
            className="h-10 w-64 animate-pulse rounded-lg bg-slate-200"
            aria-label="Loading teams"
          />
        ) : (
          <Select
            label="Team"
            className="w-full sm:w-64"
            value={selectedTeamId ?? ''}
            onChange={(e) =>
              // Epic filter is team-scoped — drop it when the team changes.
              updateParams({ team: e.target.value, epic: null })
            }
            disabled={noTeams}
          >
            {teams?.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
            {noTeams && <option value="">No teams available</option>}
          </Select>
        )}
        <LinkButton to="/tickets/new">+ New ticket</LinkButton>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <TextInput
            label="Search"
            type="search"
            placeholder="Search title..."
            className="w-full sm:w-64"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <Select
            label="Type"
            className="w-full sm:w-44"
            value={typeFilter ?? ''}
            onChange={(e) => updateParams({ type: e.target.value || null })}
          >
            <option value="">All types</option>
            {TICKET_TYPES.map((type) => (
              <option key={type} value={type}>
                {TICKET_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
          <Select
            label="Epic"
            className="w-full sm:w-44"
            value={epicParam ?? ''}
            onChange={(e) => updateParams({ epic: e.target.value || null })}
          >
            <option value="">All epics</option>
            {epics?.map((epic) => (
              <option key={epic.id} value={epic.id}>
                {epic.title}
              </option>
            ))}
          </Select>
          <Button
            variant="secondary"
            disabled={!hasFilters}
            onClick={() => updateParams({ type: null, epic: null, q: null })}
          >
            Clear
          </Button>
          <p className="ml-auto text-sm text-slate-500" aria-live="polite">
            {data ? `${data.total} ticket${data.total === 1 ? '' : 's'}` : '…'}
          </p>
        </div>
      </Card>

      {noTeams ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          No teams yet.{' '}
          <Link to="/teams" className="font-semibold text-slate-900 underline">
            Create a team
          </Link>{' '}
          to start adding tickets.
        </Card>
      ) : isError ? (
        <Card className="p-8 text-center">
          <p role="alert" className="text-sm text-red-700">
            Failed to load the board
            {error instanceof Error ? ` — ${error.message}` : '.'}
          </p>
          <Button className="mt-4" variant="secondary" onClick={() => void refetch()}>
            Retry
          </Button>
        </Card>
      ) : showSkeleton ? (
        <BoardSkeleton />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          accessibility={{ announcements, screenReaderInstructions }}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={finishDrag}
        >
          <div
            className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 ${
              isPlaceholderData ? 'opacity-60 transition-opacity' : ''
            }`}
          >
            {TICKET_STATES.map((state) => (
              <BoardColumn
                key={state}
                state={state}
                tickets={columns.get(state) ?? []}
                epicTitleById={epicTitleById}
                onOpen={openTicket}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTicket ? (
              <div className="rounded-lg border border-slate-400 bg-white p-3 shadow-lg">
                <TicketCardContent
                  ticket={activeTicket}
                  epicTitle={
                    activeTicket.epic_id
                      ? epicTitleById.get(activeTicket.epic_id)
                      : undefined
                  }
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {toast && <Toast message={toast} onDismiss={dismissToast} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Columns & cards (memoized — the board must stay smooth at 100+ tickets)
// ---------------------------------------------------------------------------

interface BoardColumnProps {
  state: TicketState
  tickets: Ticket[]
  epicTitleById: Map<string, string>
  onOpen: (id: string) => void
}

const BoardColumn = memo(function BoardColumn({
  state,
  tickets,
  epicTitleById,
  onOpen,
}: BoardColumnProps) {
  const label = TICKET_STATE_LABELS[state]
  const { setNodeRef, isOver } = useDroppable({ id: state })

  return (
    <section
      ref={setNodeRef}
      data-column={state}
      aria-label={`${label} column`}
      className={`flex min-h-[420px] flex-col gap-3 rounded-lg border bg-white p-3 shadow-sm transition-colors ${
        isOver ? 'border-slate-900 ring-2 ring-slate-900/20' : 'border-slate-200'
      }`}
    >
      <header className="flex items-center justify-between gap-2">
        <h2
          title={label}
          className="truncate text-sm font-bold uppercase tracking-wide text-slate-700"
        >
          {label}
        </h2>
        <CountBadge count={tickets.length} />
      </header>
      {tickets.length === 0 ? (
        <p className="flex flex-1 items-start justify-center pt-8 text-sm text-slate-400">
          No tickets
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              epicTitle={
                ticket.epic_id ? epicTitleById.get(ticket.epic_id) : undefined
              }
              onOpen={onOpen}
            />
          ))}
        </ul>
      )}
    </section>
  )
})

interface TicketCardProps {
  ticket: Ticket
  epicTitle: string | undefined
  onOpen: (id: string) => void
}

const TicketCard = memo(function TicketCard({
  ticket,
  epicTitle,
  onOpen,
}: TicketCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    isDragging,
  } = useDraggable({ id: ticket.id, data: { state: ticket.state } })

  return (
    <li ref={setNodeRef} className={isDragging ? 'opacity-40' : undefined}>
      {/*
        Pointer drag works from anywhere on the card (listeners on the wrapper);
        the Move button is the keyboard activator (setActivatorNodeRef), so
        Enter on the title link still navigates instead of lifting the card.
      */}
      <div
        {...listeners}
        onClick={() => onOpen(ticket.id)}
        className="relative cursor-pointer touch-none rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-slate-400"
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Move ticket: ${ticket.title}`}
          className="absolute right-1.5 top-1.5 cursor-grab rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path d="M6 3.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0 4.5A1.25 1.25 0 1 1 3.5 8 1.25 1.25 0 0 1 6 8Zm0 4.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm6.5-9a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0 4.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0 4.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z" />
          </svg>
        </button>
        <TicketCardContent ticket={ticket} epicTitle={epicTitle} withLink />
      </div>
    </li>
  )
})

interface TicketCardContentProps {
  ticket: Ticket
  epicTitle: string | undefined
  /** Render the title as the navigation link (off inside the DragOverlay). */
  withLink?: boolean
}

function TicketCardContent({
  ticket,
  epicTitle,
  withLink = false,
}: TicketCardContentProps) {
  const title = withLink ? (
    <Link
      to={`/tickets/${ticket.id}`}
      draggable={false}
      onClick={(e) => e.stopPropagation()}
      className="mt-2 block pr-6 font-semibold leading-snug text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
    >
      {ticket.title}
    </Link>
  ) : (
    <p className="mt-2 block pr-6 font-semibold leading-snug text-slate-900">
      {ticket.title}
    </p>
  )

  return (
    <>
      <TypeBadge type={ticket.type} />
      {title}
      <div className="mt-3 flex items-end justify-between gap-2 text-xs text-slate-500">
        <span className="truncate">
          {epicTitle ? `Epic: ${epicTitle}` : 'No epic'}
        </span>
        <span className="shrink-0">
          {relativeTimeFromNow(ticket.modified_at)}
        </span>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function BoardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading board"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
    >
      {TICKET_STATES.map((state) => (
        <div
          key={state}
          className="flex min-h-[420px] flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
        >
          <div className="h-5 w-3/4 animate-pulse rounded bg-slate-200" />
          <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
        </div>
      ))}
    </div>
  )
}
