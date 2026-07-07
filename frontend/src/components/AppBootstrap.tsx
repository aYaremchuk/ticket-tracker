/**
 * AppBootstrap — runs once on app mount.
 *
 * 1. Primes the CSRF token cache (GET /api/csrf) so the first write request
 *    doesn't block.
 * 2. Dispatches `loadCurrentUser` (GET /api/me) to restore any existing session.
 *
 * Renders a minimal full-screen spinner while auth status is being resolved
 * so the guards never see a flash of the wrong page.
 */

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { getCsrf } from '../api/client.ts'
import { useAppDispatch, useAppSelector } from '../store/index.ts'
import { loadCurrentUser } from '../store/authSlice.ts'

interface Props {
  children: ReactNode
}

export function AppBootstrap({ children }: Props) {
  const dispatch = useAppDispatch()
  const status = useAppSelector((state) => state.auth.status)

  useEffect(() => {
    // Prime CSRF cache so writes are instant, then check session.
    void getCsrf().catch(() => {
      // CSRF fetch failures are non-fatal on initial load — the token will be
      // re-fetched lazily before the first write request.
    })
    void dispatch(loadCurrentUser())
  }, [dispatch])

  if (status === 'idle' || status === 'loading') {
    return (
      <div
        role="status"
        aria-label="Loading"
        className="flex min-h-screen items-center justify-center bg-slate-50"
      >
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
      </div>
    )
  }

  return <>{children}</>
}
