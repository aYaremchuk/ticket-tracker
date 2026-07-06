import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Textarea } from '../components/ui/Textarea'
import { TextInput } from '../components/ui/TextInput'
import { mockComments, mockEpics, mockTicket } from '../data/mock'
import {
  TICKET_STATES,
  TICKET_STATE_LABELS,
  TICKET_TYPES,
  TICKET_TYPE_LABELS,
} from '../types/api'

export function TicketDetailPage() {
  return (
    <div className="space-y-4">
      <Link
        to="/board"
        className="inline-block text-sm font-bold text-slate-900 hover:underline"
      >
        ← Back to {mockTicket.team}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-slate-500">
          TCK-{mockTicket.number}
          <span aria-hidden="true" className="mx-2">
            •
          </span>
          Created by {mockTicket.createdBy}
          <span aria-hidden="true" className="mx-2">
            •
          </span>
          Created {mockTicket.createdAt}
          <span aria-hidden="true" className="mx-2">
            •
          </span>
          Modified {mockTicket.modifiedAt}
        </p>
        <div className="flex gap-3">
          <Button variant="secondary">Delete</Button>
          <Button>Save</Button>
        </div>
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        {mockTicket.title}
      </h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <form
            className="space-y-5"
            onSubmit={(event) => event.preventDefault()}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Select label="Team" defaultValue="payments">
                <option value="payments">Payments Team</option>
                <option value="mobile">Mobile Apps</option>
                <option value="internal">Internal Tools</option>
              </Select>
              <Select label="Type" defaultValue={mockTicket.type}>
                {TICKET_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TICKET_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
              <Select label="State" defaultValue={mockTicket.state}>
                {TICKET_STATES.map((state) => (
                  <option key={state} value={state}>
                    {TICKET_STATE_LABELS[state]}
                  </option>
                ))}
              </Select>
            </div>
            <Select label="Epic" defaultValue="e1">
              <option value="">No epic</option>
              {mockEpics.map((epic) => (
                <option key={epic.id} value={epic.id}>
                  {epic.title}
                </option>
              ))}
            </Select>
            <TextInput label="Title" defaultValue={mockTicket.title} />
            <Textarea label="Body" rows={8} defaultValue={mockTicket.body} />
          </form>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Comments
            </h2>
            <span
              aria-label={`${mockComments.length} comments`}
              className="text-sm font-semibold text-slate-500"
            >
              {mockComments.length}
            </span>
          </div>
          <ul className="mt-4 space-y-3">
            {mockComments.map((comment) => (
              <li
                key={comment.id}
                className="rounded-lg border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-bold text-slate-900">
                    {comment.author}
                  </span>
                  <span className="text-slate-500">{comment.time}</span>
                </div>
                <p className="mt-2 text-sm text-slate-700">{comment.body}</p>
              </li>
            ))}
          </ul>
          <form
            className="mt-6"
            onSubmit={(event) => event.preventDefault()}
          >
            <Textarea
              label="Add comment"
              rows={3}
              placeholder="Write a comment..."
            />
            <div className="mt-3 flex justify-end">
              <Button type="submit">Post comment</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
