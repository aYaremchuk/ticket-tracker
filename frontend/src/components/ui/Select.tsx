import { useId } from 'react'
import type { ReactNode, SelectHTMLAttributes } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  /** Wrapper width/layout classes; the control itself is always w-full. */
  className?: string
  children: ReactNode
}

export function Select({
  label,
  id,
  className = '',
  children,
  ...rest
}: SelectProps) {
  const autoId = useId()
  const selectId = id ?? autoId
  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={selectId}
          className="mb-1.5 block text-sm font-semibold text-slate-900"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 pr-9 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
          {...rest}
        >
          {children}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
        >
          <path d="M4 6l4 4 4-4H4z" />
        </svg>
      </div>
    </div>
  )
}
