import type { ReactNode } from 'react'

interface CardProps {
  className?: string
  children: ReactNode
}

/** Surface panel per design-system.md: white, slate-200 border, subtle shadow. */
export function Card({ className = '', children }: CardProps) {
  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  )
}
