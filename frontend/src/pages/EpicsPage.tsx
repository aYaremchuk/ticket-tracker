import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Select } from '../components/ui/Select'
import { Textarea } from '../components/ui/Textarea'
import { TextInput } from '../components/ui/TextInput'
import { mockEpics } from '../data/mock'

const DELETE_NOTE = 'Delete is disabled while tickets reference the epic.'

export function EpicsPage() {
  const editedEpic = mockEpics[0]

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        Epics
      </h1>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <Select label="Team" className="w-full sm:w-64" defaultValue="payments">
          <option value="payments">Payments Team</option>
          <option value="mobile">Mobile Apps</option>
          <option value="internal">Internal Tools</option>
        </Select>
        <Button>+ Create epic</Button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="overflow-hidden lg:col-span-3">
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
              {mockEpics.map((epic) => {
                const referenced = epic.tickets > 0
                return (
                  <tr key={epic.id}>
                    <td className="px-4 py-4">
                      <p className="font-bold text-slate-900">{epic.title}</p>
                      <p className="mt-1 text-slate-500">{epic.description}</p>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{epic.tickets}</td>
                    <td className="px-4 py-4 text-slate-500">
                      {epic.modified}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm">
                          Edit
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={referenced}
                          aria-label={`Delete ${epic.title}`}
                          title={referenced ? DELETE_NOTE : undefined}
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

        <Card className="self-start p-6 lg:col-span-2">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Edit epic
          </h2>
          <form
            className="mt-4 space-y-5"
            onSubmit={(event) => event.preventDefault()}
          >
            <TextInput label="Title" defaultValue={editedEpic.title} />
            <Textarea
              label="Description (optional)"
              rows={5}
              defaultValue={editedEpic.description}
            />
            <div className="flex justify-end gap-3">
              <Button variant="secondary">Cancel</Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
