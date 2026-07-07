import { Link } from 'react-router-dom'
import { CountBadge, TypeBadge } from '../components/ui/Badge'
import { Button, LinkButton } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { TextInput } from '../components/ui/TextInput'
import { mockBoardColumns, mockEpics, totalTicketCount } from '../data/mock'
import type { MockBoardColumn } from '../data/mock'
import { TICKET_STATE_LABELS, TICKET_TYPES, TICKET_TYPE_LABELS } from '../types/api'

export function BoardPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Select label="Team" className="w-full sm:w-64" defaultValue="payments">
          <option value="payments">Payments Team</option>
          <option value="mobile">Mobile Apps</option>
          <option value="internal">Internal Tools</option>
        </Select>
        <LinkButton to="/tickets/new">+ New ticket</LinkButton>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <TextInput
            label="Search"
            type="search"
            placeholder="Search title..."
            className="w-full sm:w-64"
          />
          <Select label="Type" className="w-full sm:w-44" defaultValue="">
            <option value="">All types</option>
            {TICKET_TYPES.map((type) => (
              <option key={type} value={type}>
                {TICKET_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
          <Select label="Epic" className="w-full sm:w-44" defaultValue="">
            <option value="">All epics</option>
            {mockEpics.map((epic) => (
              <option key={epic.id} value={epic.id}>
                {epic.title}
              </option>
            ))}
          </Select>
          <Button variant="secondary">Clear</Button>
          <p className="ml-auto text-sm text-slate-500">
            {totalTicketCount} tickets
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {mockBoardColumns.map((column) => (
          <BoardColumn key={column.state} column={column} />
        ))}
      </div>
    </div>
  )
}

function BoardColumn({ column }: { column: MockBoardColumn }) {
  const label = TICKET_STATE_LABELS[column.state]
  return (
    <section
      aria-label={`${label} (${column.count} tickets)`}
      className="flex min-h-[420px] flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
    >
      <header className="flex items-center justify-between gap-2">
        <h2
          title={label}
          className="truncate text-sm font-bold uppercase tracking-wide text-slate-700"
        >
          {label}
        </h2>
        <CountBadge count={column.count} />
      </header>
      <ul className="flex flex-col gap-3">
        {column.cards.map((card) => (
          <li key={card.id}>
            <Link
              to="/tickets/1042"
              className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
            >
              <TypeBadge type={card.type} />
              <p className="mt-2 font-semibold leading-snug text-slate-900">
                {card.title}
              </p>
              <div className="mt-3 flex items-end justify-between gap-2 text-xs text-slate-500">
                <span className="truncate">
                  {card.epic ? `Epic: ${card.epic}` : 'No epic'}
                </span>
                <span className="shrink-0">{card.ago}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
