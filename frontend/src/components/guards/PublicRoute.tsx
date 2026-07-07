/**
 * PublicRoute — wraps auth-only pages (login, signup, verify).
 * If the user is already authenticated, redirect to /board so they skip
 * the auth screens. While bootstrap is in flight, render nothing.
 */

import { Navigate, Outlet } from 'react-router-dom'
import { useAppSelector } from '../../store/index.ts'

export function PublicRoute() {
  const status = useAppSelector((state) => state.auth.status)

  if (status === 'idle' || status === 'loading') {
    return null
  }

  if (status === 'authenticated') {
    return <Navigate to="/board" replace />
  }

  return <Outlet />
}
