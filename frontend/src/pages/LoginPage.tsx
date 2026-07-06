import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthCard } from '../components/auth/AuthCard'
import { Button } from '../components/ui/Button'
import { TextInput } from '../components/ui/TextInput'

/**
 * Login screen. The "unverified" affordance is CONTEXTUAL: it only appears after
 * a login attempt returns 403 `email_unverified` — not by default. (Prototype
 * uses local state; M1 sets `error` from the real API response.)
 */
type LoginError = null | 'invalid_credentials' | 'email_unverified'

export function LoginPage() {
  const [error, setError] = useState<LoginError>(null)

  return (
    <AuthCard title="Log in" subtitle="Use your verified account.">
      <form
        className="mt-6 space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          // Prototype only — M1 wires this to POST /api/login and maps the
          // response code (401 → invalid_credentials, 403 → email_unverified).
          setError(null)
        }}
      >
        <TextInput
          label="Email"
          type="email"
          placeholder="name@example.com"
          autoComplete="email"
        />
        <TextInput
          label="Password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
        />

        {error === 'invalid_credentials' && (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            Invalid email or password.
          </p>
        )}

        <Button type="submit" className="w-full">
          Log in
        </Button>
      </form>

      {/* Only shown when the account exists but isn't verified yet (403). */}
      {error === 'email_unverified' && (
        <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-center">
          <p className="text-sm text-amber-800">
            Your account isn’t verified yet. Check your inbox, or resend the
            verification email.
          </p>
          <Button variant="secondary" className="mt-3">
            Resend verification email
          </Button>
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
