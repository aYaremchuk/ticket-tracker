/**
 * ProtectedRoute — wraps authenticated-only routes.
 * If auth status resolves to 'unauthenticated', redirect to /login.
 * While the bootstrap is still in flight ('idle' | 'loading'), render nothing
 * so we don't flash a redirect before we know the session state.
 */

import { Navigate, Outlet } from 'react-router-dom'
import { useAppSelector } from '../../store/index.ts'

export function ProtectedRoute() {
  const status = useAppSelector((state) => state.auth.status)

  if (status === 'idle' || status === 'loading') {
    // Bootstrap in progress — hold rendering until we know the auth state.
    return null
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
