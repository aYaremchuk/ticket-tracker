import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError, confirmPasswordReset } from '../api/client.ts'
import { AuthCard } from '../components/auth/AuthCard.tsx'
import { Button } from '../components/ui/Button.tsx'
import { LinkButton } from '../components/ui/Button.tsx'
import { TextInput } from '../components/ui/TextInput.tsx'

/**
 * Reset-password screen (route /reset-password, public).
 *
 * Reads ?token= from the URL and calls POST /api/password_reset/confirm.
 * States:
 *  - 'form'    → password + confirm fields
 *  - 'success' → "Password reset — continue to login"
 *  - 'invalid' → 410 token_invalid — "Expired or invalid link"
 *
 * If the token is missing from the URL we treat it as 'invalid' immediately
 * so the user gets a helpful error rather than a form that can never succeed.
 */

type ResetStep = 'form' | 'success' | 'invalid'

interface FieldErrors {
  password?: string
  confirmPassword?: string
  general?: string
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  // If there's no token in the URL, show the invalid state immediately.
  const [step, setStep] = useState<ResetStep>(token ? 'form' : 'invalid')
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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrors({})

    const clientErrors = validate()
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors)
      return
    }

    setLoading(true)
    try {
      await confirmPasswordReset(token, password)
      setStep('success')
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 410 && err.code === 'token_invalid') {
          setStep('invalid')
        } else if (err.status === 422 && err.details) {
          const errs: FieldErrors = {}
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

  if (step === 'success') {
    return (
      <AuthCard title="Password reset">
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
            Password updated
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Your password has been reset. You can now log in with your new
            password.
          </p>
          <LinkButton to="/login" className="mt-6 w-full">
            Continue to login
          </LinkButton>
        </div>
      </AuthCard>
    )
  }

  if (step === 'invalid') {
    return (
      <AuthCard title="Password reset">
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
            This reset link has expired or already been used. Request a new
            one.
          </p>
          <p className="mt-6 text-sm font-bold text-slate-900">
            <Link to="/forgot-password" className="hover:underline">
              Request a new reset link →
            </Link>
          </p>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Reset password"
      subtitle="Choose a new password for your account."
    >
      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
      >
        <div>
          <TextInput
            label="New password"
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
            label="Confirm new password"
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
          {loading ? 'Resetting…' : 'Reset password'}
        </Button>
      </form>
    </AuthCard>
  )
}
