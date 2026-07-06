import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Provider } from 'react-redux'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppBootstrap } from './components/AppBootstrap.tsx'
import { ProtectedRoute } from './components/guards/ProtectedRoute.tsx'
import { PublicRoute } from './components/guards/PublicRoute.tsx'
import { AppLayout } from './components/layout/AppLayout.tsx'
import { BoardPage } from './pages/BoardPage.tsx'
import { EpicsPage } from './pages/EpicsPage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { SignupPage } from './pages/SignupPage.tsx'
import { StatusPage } from './pages/StatusPage.tsx'
import { TeamsPage } from './pages/TeamsPage.tsx'
import { TicketCreatePage } from './pages/TicketCreatePage.tsx'
import { TicketDetailPage } from './pages/TicketDetailPage.tsx'
import { VerifyEmailPage } from './pages/VerifyEmailPage.tsx'
import { store } from './store/index.ts'

/**
 * TanStack Query client for M2+ server-state (boards, teams, epics, tickets).
 * Defined outside the component so it isn't recreated on re-renders.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale after 30 s; background refetch on window focus.
      staleTime: 30_000,
      retry: 1,
    },
  },
})

/**
 * Root app. Providers are ordered from outermost to innermost:
 *  1. Redux store (needed by AppBootstrap + guards)
 *  2. TanStack Query (needed by data-fetching hooks in later milestones)
 *  3. BrowserRouter (needed by all route components)
 *  4. AppBootstrap (dispatches loadCurrentUser; shows spinner until resolved)
 */
function App() {
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppBootstrap>
            <Routes>
              <Route path="/status" element={<StatusPage />} />

              {/* Public routes — redirect to /board if already authenticated. */}
              <Route element={<PublicRoute />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/verify" element={<VerifyEmailPage />} />
              </Route>

              {/* Protected routes — redirect to /login if not authenticated. */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route index element={<Navigate to="/board" replace />} />
                  <Route path="/board" element={<BoardPage />} />
                  <Route path="/tickets/new" element={<TicketCreatePage />} />
                  <Route path="/tickets/:id" element={<TicketDetailPage />} />
                  <Route path="/teams" element={<TeamsPage />} />
                  <Route path="/epics" element={<EpicsPage />} />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/board" replace />} />
            </Routes>
          </AppBootstrap>
        </BrowserRouter>
      </QueryClientProvider>
    </Provider>
  )
}

export default App
