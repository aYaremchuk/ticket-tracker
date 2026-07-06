import { useCallback, useEffect, useState } from 'react'

interface Health {
  status: string
  service: string
  database: string
  time: string
}

type Probe =
  | { state: 'loading' }
  | { state: 'ok'; data: Health }
  | { state: 'error'; message: string }

/**
 * Developer status page. Pings GET /api/health and shows a green/red indicator.
 * Standalone (no auth, not part of the required screens) — handy during dev.
 */
export function StatusPage() {
  const [probe, setProbe] = useState<Probe>({ state: 'loading' })

  const check = useCallback(() => {
    setProbe({ state: 'loading' })
    fetch('/api/health')
      .then(async (res) => {
        if (!res.ok) throw new Error(`API responded ${res.status}`)
        return (await res.json()) as Health
      })
      .then((data) => setProbe({ state: 'ok', data }))
      .catch((err: unknown) =>
        setProbe({
          state: 'error',
          message: err instanceof Error ? err.message : 'Unknown error',
        }),
      )
  }, [])

  useEffect(() => {
    check()
  }, [check])

  const healthy = probe.state === 'ok' && probe.data.status === 'ok'
  const dotColor =
    probe.state === 'loading'
      ? 'bg-slate-300'
      : healthy
        ? 'bg-emerald-500'
        : 'bg-red-500'

  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        System status
      </h1>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <span
            className={`inline-block h-3 w-3 rounded-full ${dotColor}`}
            aria-hidden="true"
          />
          <span className="font-medium text-slate-800">
            {probe.state === 'loading' && 'Checking…'}
            {probe.state === 'ok' &&
              (healthy ? 'All systems operational' : 'Degraded')}
            {probe.state === 'error' && 'API unreachable'}
          </span>
        </div>

        {probe.state === 'ok' && (
          <dl className="mt-4 grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
            <dt className="text-slate-500">API</dt>
            <dd className="text-slate-800">{probe.data.status}</dd>
            <dt className="text-slate-500">Database</dt>
            <dd className="text-slate-800">{probe.data.database}</dd>
            <dt className="text-slate-500">Service</dt>
            <dd className="text-slate-800">{probe.data.service}</dd>
            <dt className="text-slate-500">Time (UTC)</dt>
            <dd className="text-slate-800">{probe.data.time}</dd>
          </dl>
        )}

        {probe.state === 'error' && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {probe.message}
          </p>
        )}

        <button
          type="button"
          onClick={check}
          className="mt-6 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Re-check
        </button>
      </section>
    </main>
  )
}
