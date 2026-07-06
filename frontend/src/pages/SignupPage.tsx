import { Link } from 'react-router-dom'
import { AuthCard } from '../components/auth/AuthCard'
import { Button } from '../components/ui/Button'
import { TextInput } from '../components/ui/TextInput'

export function SignupPage() {
  return (
    <AuthCard title="Create account" subtitle="Email verification is required.">
      <form
        className="mt-6 space-y-5"
        onSubmit={(event) => event.preventDefault()}
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
          placeholder="Minimum 8 characters"
          autoComplete="new-password"
        />
        <TextInput
          label="Confirm password"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
        />
        <Button type="submit" className="w-full">
          Sign up
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
