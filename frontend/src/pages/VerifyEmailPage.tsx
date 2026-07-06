import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError, resendVerification, verifyEmail } from '../api/client.ts'
import { AuthCard } from '../components/auth/AuthCard.tsx'
import { Button, LinkButton } from '../components/ui/Button.tsx'

type VerifyStatus = 'loading' | 'success' | 'invalid' | 'missing_token'

/**
 * VerifyEmailPage reads `?token=` from the URL, calls POST /api/verify_email
 * on mount, and renders the appropriate state:
 *  - loading spinner while the request is in flight
 *  - success (✓ + "Continue to login") on 200
 *  - error (✗ + resend affordance) on 410 token_invalid or missing token
 */
export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token')

  const [status, setStatus] = useState<VerifyStatus>(token ? 'loading' : 'missing_token')
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null)

  // Resend flow — the user may have arrived from the login page and knows their email.
  const [resendEmail, setResendEmail] = useState('')
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle')

  useEffect(() => {
    if (!token) {
      setStatus('missing_token')
      return
    }

    let cancelled = false

    verifyEmail(token)
      .then((res) => {
        if (!cancelled) {
          setVerifiedEmail(res.email)
          setStatus('success')
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('invalid')
      })

    return () => {
      cancelled = true
    }
  }, [token])

  async function handleResend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const emailToSend = resendEmail.trim() || verifiedEmail || ''
    if (!emailToSend) return
    setResendStatus('sending')
    try {
      await resendVerification(emailToSend)
    } catch (err) {
      // resendVerification always 202s, but guard against ApiError just in case.
      if (!(err instanceof ApiError)) {
        // unexpected — still show sent (no enumeration)
      }
    } finally {
      setResendStatus('sent')
    }
  }

  if (status === 'loading') {
    return (
      <AuthCard title="Email verification">
        <div
          role="status"
          aria-label="Verifying email"
          className="mt-8 flex justify-center"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900" />
        </div>
      </AuthCard>
    )
  }

  if (status === 'success') {
    return (
      <AuthCard title="Email verification">
        <div className="mt-8 flex flex-col items-center text-center">
          <div
            aria-hidden="true"
            className="flex h-24 w-24 items-center justify-center rounded-full border border-slate-300 bg-slate-100"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-10 w-10 text-slate-900"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="mt-6 text-2xl font-bold tracking-tight text-slate-900">
            Email verified
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Your account is ready to use.
          </p>
          <LinkButton to="/login" className="mt-6 w-full">
            Continue to login
          </LinkButton>
        </div>
      </AuthCard>
    )
  }

  // Both 'invalid' and 'missing_token' show the error + resend state.
  return (
    <AuthCard title="Email verification">
      <div className="mt-8 flex flex-col items-center text-center">
        <div
          aria-hidden="true"
          className="flex h-24 w-24 items-center justify-center rounded-full border border-red-200 bg-red-50"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            className="h-10 w-10 text-red-600"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </div>
        <h2 className="mt-6 text-2xl font-bold tracking-tight text-slate-900">
          Expired or invalid link
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Request a new verification email to continue.
        </p>

        {resendStatus === 'sent' ? (
          <p className="mt-6 text-sm font-semibold text-slate-700">
            Verification email sent — check your inbox.
          </p>
        ) : (
          <form
            className="mt-6 w-full space-y-3"
            onSubmit={(e) => void handleResend(e)}
          >
            <input
              type="email"
              placeholder="your@email.com"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
              value={resendEmail}
              onChange={(e) => setResendEmail(e.target.value)}
              aria-label="Email address for resend"
              required
              disabled={resendStatus === 'sending'}
            />
            <Button
              type="submit"
              variant="secondary"
              className="w-full"
              disabled={resendStatus === 'sending'}
            >
              {resendStatus === 'sending' ? 'Sending…' : 'Resend email'}
            </Button>
          </form>
        )}

        <p className="mt-6 text-sm font-bold text-slate-900">
          <Link to="/login" className="hover:underline">
            Back to log in →
          </Link>
        </p>
      </div>
    </AuthCard>
  )
}
