import type { TicketType } from '../../types/api'
import { TICKET_TYPE_LABELS } from '../../types/api'

const typeClasses: Record<TicketType, string> = {
  bug: 'bg-red-100 text-red-700',
  feature: 'bg-indigo-100 text-indigo-700',
  fix: 'bg-amber-100 text-amber-700',
}

/** Ticket type pill, color-coded per design-system.md. */
export function TypeBadge({ type }: { type: TicketType }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${typeClasses[type]}`}
    >
      {TICKET_TYPE_LABELS[type]}
    </span>
  )
}

/** Neutral numeric badge (board column counts). */
export function CountBadge({ count }: { count: number }) {
  return (
    <span className="inline-flex min-w-6 justify-center rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
      {count}
    </span>
  )
}
