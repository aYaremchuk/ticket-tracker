import { Link, useSearchParams } from 'react-router-dom'
import { AuthCard } from '../components/auth/AuthCard'
import { Button, LinkButton } from '../components/ui/Button'

/**
 * Static verification result. Default renders the success state; the
 * "expired or invalid link" error variant renders at /verify?status=error.
 */
export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const isError = params.get('status') === 'error'

  return (
    <AuthCard title="Email verification">
      <div className="mt-8 flex flex-col items-center text-center">
        {isError ? (
          <>
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
            <Button variant="secondary" className="mt-6 w-full">
              Resend email
            </Button>
            <p className="mt-6 text-sm font-bold text-slate-900">
              <Link to="/login" className="hover:underline">
                Back to log in →
              </Link>
            </p>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </AuthCard>
  )
}
