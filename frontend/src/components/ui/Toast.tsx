import { useEffect } from 'react'

interface ToastProps {
  message: string
  onDismiss: () => void
  /** Auto-dismiss delay in ms. */
  duration?: number
}

/**
 * Transient error toast (bottom-right). Announced immediately to screen
 * readers via role="alert"; auto-dismisses and offers a manual close.
 */
export function Toast({ message, onDismiss, duration = 5000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration)
    return () => clearTimeout(timer)
  }, [message, onDismiss, duration])

  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-lg"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="shrink-0 rounded p-0.5 leading-none hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
          <path d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L6.94 8l-3.72 3.72a.75.75 0 1 0 1.06 1.06L8 9.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L9.06 8l3.72-3.72a.75.75 0 0 0-1.06-1.06L8 6.94 4.28 3.22Z" />
        </svg>
      </button>
    </div>
  )
}
