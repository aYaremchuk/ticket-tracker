import { useState } from 'react'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Modal } from '../components/ui/Modal'
import { TextInput } from '../components/ui/TextInput'
import { mockTeams } from '../data/mock'

const DELETE_NOTE = 'Delete is disabled while a team contains tickets or epics.'

export function TeamsPage() {
  // Closed by default; opens when the user clicks "+ Create team".
  const [createOpen, setCreateOpen] = useState(false)

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
        <Button onClick={() => setCreateOpen(true)}>+ Create team</Button>
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
            {mockTeams.map((team) => {
              const referenced = team.tickets + team.epics > 0
              return (
                <tr key={team.id}>
                  <td className="px-4 py-4 font-bold text-slate-900">
                    {team.name}
                  </td>
                  <td className="px-4 py-4 text-slate-700">{team.tickets}</td>
                  <td className="px-4 py-4 text-slate-700">{team.epics}</td>
                  <td className="px-4 py-4 text-slate-500">{team.modified}</td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm">
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={referenced}
                        title={referenced ? DELETE_NOTE : undefined}
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

      {createOpen && (
        <Modal title="Create team" onClose={() => setCreateOpen(false)}>
          <form
            className="mt-4 flex flex-wrap items-end gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              setCreateOpen(false)
            }}
          >
            <TextInput
              label="Team name"
              placeholder="e.g. Platform Engineering"
              className="min-w-64 flex-1"
            />
            <Button type="submit">Create</Button>
          </form>
        </Modal>
      )}
    </div>
  )
}
