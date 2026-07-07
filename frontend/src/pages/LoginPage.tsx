import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, login, resendVerification } from '../api/client.ts'
import { AuthCard } from '../components/auth/AuthCard.tsx'
import { Button } from '../components/ui/Button.tsx'
import { TextInput } from '../components/ui/TextInput.tsx'
import { useAppDispatch } from '../store/index.ts'
import { setUser } from '../store/authSlice.ts'

/**
 * Login screen. The "unverified" affordance is CONTEXTUAL: it only appears after
 * a login attempt returns 403 `email_unverified` — not by default.
 */
type LoginError = null | 'invalid_credentials' | 'email_unverified' | 'unknown'

export function LoginPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<LoginError>(null)
  const [loading, setLoading] = useState(false)

  // Resend-verification banner state
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle')

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await login({ email, password })
      dispatch(setUser(res.user))
      navigate('/board', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError('invalid_credentials')
        } else if (err.status === 403 && err.code === 'email_unverified') {
          setError('email_unverified')
        } else {
          setError('unknown')
        }
      } else {
        setError('unknown')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (!email) return
    setResendStatus('sending')
    try {
      await resendVerification(email)
    } finally {
      // Always show 'sent' — the API always returns 202 regardless of whether
      // the account exists, to prevent account enumeration.
      setResendStatus('sent')
    }
  }

  return (
    <AuthCard title="Log in" subtitle="Use your verified account.">
      <form className="mt-6 space-y-5" onSubmit={(e) => void handleSubmit(e)}>
        <TextInput
          label="Email"
          type="email"
          placeholder="name@example.com"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
        />
        <TextInput
          label="Password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loading}
        />

        {error === 'invalid_credentials' && (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            Invalid email or password.
          </p>
        )}

        {error === 'unknown' && (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            Something went wrong. Please try again.
          </p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Logging in…' : 'Log in'}
        </Button>

        <p className="mt-2 text-center text-sm text-slate-500">
          <Link to="/forgot-password" className="font-semibold text-slate-900 hover:underline">
            Forgot password?
          </Link>
        </p>
      </form>

      {/* Only shown when the account exists but isn't verified yet (403 email_unverified). */}
      {error === 'email_unverified' && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-center"
        >
          <p className="text-sm text-amber-800">
            Your account isn't verified yet. Check your inbox, or resend the
            verification email.
          </p>
          {resendStatus === 'sent' ? (
            <p className="mt-3 text-sm font-semibold text-amber-700">
              Verification email sent — check your inbox.
            </p>
          ) : (
            <Button
              variant="secondary"
              className="mt-3"
              onClick={() => void handleResend()}
              disabled={resendStatus === 'sending' || !email}
            >
              {resendStatus === 'sending' ? 'Sending…' : 'Resend verification email'}
            </Button>
          )}
        </div>
      )}

      <p className="mt-8 text-center text-sm font-bold text-slate-900">
        <Link to="/signup" className="hover:underline">
          Create an account →
        </Link>
      </p>
    </AuthCard>
  )
}
