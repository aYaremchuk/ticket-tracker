import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  /** Wrapper width/layout classes; the control itself is always w-full. */
  className?: string
}

export function TextInput({ label, id, className = '', ...rest }: TextInputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-sm font-semibold text-slate-900"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
        {...rest}
      />
    </div>
  )
}
