import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { BoardPage } from './pages/BoardPage'
import { EpicsPage } from './pages/EpicsPage'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'
import { StatusPage } from './pages/StatusPage'
import { TeamsPage } from './pages/TeamsPage'
import { TicketDetailPage } from './pages/TicketDetailPage'
import { VerifyEmailPage } from './pages/VerifyEmailPage'

/**
 * Static design-prototype router. Auth screens render standalone; the rest
 * share the AppLayout shell. No auth guards or data fetching — mock data only.
 */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/status" element={<StatusPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/verify" element={<VerifyEmailPage />} />
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/board" replace />} />
          <Route path="/board" element={<BoardPage />} />
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/epics" element={<EpicsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/board" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
