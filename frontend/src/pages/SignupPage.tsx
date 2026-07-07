import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, signup } from '../api/client.ts'
import { AuthCard } from '../components/auth/AuthCard.tsx'
import { Button } from '../components/ui/Button.tsx'
import { TextInput } from '../components/ui/TextInput.tsx'

type SignupStep = 'form' | 'sent'

interface FieldErrors {
  email?: string
  password?: string
  confirmPassword?: string
  general?: string
}

export function SignupPage() {
  const [step, setStep] = useState<SignupStep>('form')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [loading, setLoading] = useState(false)

  function validate(): FieldErrors {
    const errs: FieldErrors = {}
    if (password.length < 8) {
      errs.password = 'Password must be at least 8 characters.'
    }
    if (password !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match.'
    }
    return errs
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors({})

    const clientErrors = validate()
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors)
      return
    }

    setLoading(true)
    try {
      await signup({ email, password })
      setStep('sent')
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setErrors({ email: 'This email is already registered.' })
        } else if (err.status === 422 && err.details) {
          const errs: FieldErrors = {}
          if (err.details.email) errs.email = err.details.email[0]
          if (err.details.password) errs.password = err.details.password[0]
          setErrors(errs)
        } else {
          setErrors({ general: err.message || 'Something went wrong. Please try again.' })
        }
      } else {
        setErrors({ general: 'Something went wrong. Please try again.' })
      }
    } finally {
      setLoading(false)
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
            Verification email sent
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            We've sent a verification link to <strong>{email}</strong>. Check
            your inbox and click the link to activate your account.
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
    <AuthCard title="Create account" subtitle="Email verification is required.">
      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
      >
        <div>
          <TextInput
            label="Email"
            type="email"
            placeholder="name@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            aria-describedby={errors.email ? 'email-error' : undefined}
          />
          {errors.email && (
            <p id="email-error" role="alert" className="mt-1 text-sm text-red-600">
              {errors.email}
            </p>
          )}
        </div>

        <div>
          <TextInput
            label="Password"
            type="password"
            placeholder="Minimum 8 characters"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            aria-describedby={errors.password ? 'password-error' : undefined}
          />
          {errors.password && (
            <p id="password-error" role="alert" className="mt-1 text-sm text-red-600">
              {errors.password}
            </p>
          )}
        </div>

        <div>
          <TextInput
            label="Confirm password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={loading}
            aria-describedby={errors.confirmPassword ? 'confirm-password-error' : undefined}
          />
          {errors.confirmPassword && (
            <p id="confirm-password-error" role="alert" className="mt-1 text-sm text-red-600">
              {errors.confirmPassword}
            </p>
          )}
        </div>

        {errors.general && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {errors.general}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating account…' : 'Sign up'}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm font-bold text-slate-900">
        <Link to="/login" className="hover:underline">
          Already registered? Log in →
        </Link>
      </p>
    </AuthCard>
  )
}
