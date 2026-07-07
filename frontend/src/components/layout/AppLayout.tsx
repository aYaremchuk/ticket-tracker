import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { logout } from '../../api/client.ts'
import { clearUser } from '../../store/authSlice.ts'
import { useAppDispatch, useAppSelector } from '../../store/index.ts'

const tabs = [
  { to: '/board', label: 'Board' },
  { to: '/teams', label: 'Teams' },
  { to: '/epics', label: 'Epics' },
]

/** Authenticated shell: TICKET TRACKER header + nav tabs + user menu. */
export function AppLayout() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-4 px-6 sm:gap-10">
          <NavLink
            to="/board"
            className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl"
          >
            TICKET TRACKER
          </NavLink>
          <nav aria-label="Primary" className="flex items-center gap-1">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  `rounded-md px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                    isActive
                      ? 'bg-slate-100 font-bold text-slate-900'
                      : 'font-medium text-slate-700 hover:bg-slate-50'
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
          <UserMenu />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}

function UserMenu() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const user = useAppSelector((state) => state.auth.user)

  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function handleLogout() {
    setOpen(false)
    setLoggingOut(true)
    try {
      await logout()
    } finally {
      dispatch(clearUser())
      navigate('/login', { replace: true })
    }
  }

  const displayEmail = user?.email ?? ''

  return (
    <div ref={ref} className="relative ml-auto">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        disabled={loggingOut}
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:opacity-50"
      >
        {displayEmail}
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-3.5 w-3.5 text-slate-500"
        >
          <path d="M4 6l4 4 4-4H4z" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {loggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      )}
    </div>
  )
}
