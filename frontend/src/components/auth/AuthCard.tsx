import type { ReactNode } from 'react'
import { Card } from '../ui/Card'

interface AuthCardProps {
  title: string
  subtitle?: string
  children: ReactNode
}

/** Centered card wrapper shared by the login / signup / verify screens. */
export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        {children}
      </Card>
    </main>
  )
}
