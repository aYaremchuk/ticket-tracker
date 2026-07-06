import { useEffect } from 'react'
import type { ReactNode } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
}

/**
 * Lightweight dialog: subtle backdrop (the wireframes keep the page visible
 * behind the panel), Escape-to-close, click-outside-to-close.
 */
export function Modal({ title, onClose, children }: ModalProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-900/20"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-2xl rounded-xl border-2 border-slate-900 bg-white p-6 shadow-lg"
      >
        <h2 className="text-xl font-bold tracking-tight text-slate-900">
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
