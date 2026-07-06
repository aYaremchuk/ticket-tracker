import { useState } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '../api/client.ts'
import { AuthCard } from '../components/auth/AuthCard.tsx'
import { Button } from '../components/ui/Button.tsx'
import { TextInput } from '../components/ui/TextInput.tsx'

/**
 * Forgot-password screen (route /forgot-password, public).
 *
 * Always shows the neutral "If the account exists…" confirmation after submit —
 * no account enumeration regardless of whether the email is registered.
 * Dev reset emails appear at /letter_opener.
 */
type ForgotStep = 'form' | 'sent'

export function ForgotPasswordPage() {
  const [step, setStep] = useState<ForgotStep>('form')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    try {
      // The API always returns 202 regardless of whether the account exists.
      // We never branch on the response to prevent account enumeration.
      await requestPasswordReset(email.trim())
    } catch {
      // Network errors are silently swallowed — we must never reveal whether
      // an account exists, so we always advance to the confirmation step.
    } finally {
      setLoading(false)
      setStep('sent')
    }
  }

  if (step === 'sent') {
    return (
      <AuthCard title="Check your email">
        <div className="mt-8 flex flex-col items-center text-center">
          <div
            aria-hidden="true"
            className="flex h-24 w-24 items-center justify-center rounded-full border border-slate-300 bg-slate-100"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-10 w-10 text-slate-700"
            >
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="M2 7l10 7 10-7" />
            </svg>
          </div>
          <h2 className="mt-6 text-2xl font-bold tracking-tight text-slate-900">
            Reset email sent
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            If an account with that address exists, a password reset link has
            been sent. Check your inbox.
          </p>
          <p className="mt-8 text-sm font-bold text-slate-900">
            <Link to="/login" className="hover:underline">
              Back to log in →
            </Link>
          </p>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Forgot password"
      subtitle="Enter your email and we'll send a reset link."
    >
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

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm font-bold text-slate-900">
        <Link to="/login" className="hover:underline">
          Back to log in →
        </Link>
      </p>
    </AuthCard>
  )
}
