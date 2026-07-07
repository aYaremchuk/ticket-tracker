/**
 * Typed fetch client — the ONLY place `fetch` lives in the frontend.
 *
 * Responsibilities:
 * 1. Base path `/api`, `credentials: 'include'` for HttpOnly session cookie.
 * 2. Fetch + cache the CSRF token from GET /api/csrf; attach it as
 *    `X-CSRF-Token` on every state-changing request (POST/PATCH/DELETE).
 * 3. Parse the error envelope `{ error: { code, message, details? } }` and
 *    throw a typed `ApiError` so callers can branch on `error.code`.
 */

import type {
  CurrentUser,
  LoginRequest,
  LoginResponse,
  SignupRequest,
} from '../types/api.ts'

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: Record<string, string[]>

  constructor(
    code: string,
    message: string,
    status: number,
    details?: Record<string, string[]>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }
}

// ---------------------------------------------------------------------------
// CSRF — double-submit + origin pattern (see api-contract.md).
// We store the token in a module-level variable so we fetch it once and reuse.
// It's also set as a readable `csrf_token` cookie by the server, but we carry
// it in the header for the double-submit check.
// ---------------------------------------------------------------------------

let csrfTokenCache: string | null = null

export async function getCsrf(): Promise<string> {
  if (csrfTokenCache !== null) return csrfTokenCache
  const res = await fetch('/api/csrf', {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new ApiError('csrf_fetch_failed', 'Failed to fetch CSRF token', res.status)
  const data = (await res.json()) as { csrf_token: string }
  csrfTokenCache = data.csrf_token
  return csrfTokenCache
}

/** Invalidate the cached CSRF token (call after logout). */
export function clearCsrfCache(): void {
  csrfTokenCache = null
}

// ---------------------------------------------------------------------------
// Core request helper
// ---------------------------------------------------------------------------

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

const MUTATING_METHODS: ReadonlySet<Method> = new Set(['POST', 'PATCH', 'DELETE'])

export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  // Attach CSRF token for all state-changing requests.
  if (MUTATING_METHODS.has(method)) {
    const token = await getCsrf()
    headers['X-CSRF-Token'] = token
  }

  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  // 204 No Content — return nothing
  if (res.status === 204) {
    return undefined as T
  }

  const json = (await res.json()) as Record<string, unknown>

  if (!res.ok) {
    // Parse the standard error envelope.
    const errEnvelope = json as { error?: { code?: string; message?: string; details?: Record<string, string[]> } }
    const err = errEnvelope.error
    throw new ApiError(
      err?.code ?? 'unknown',
      err?.message ?? 'An unexpected error occurred.',
      res.status,
      err?.details,
    )
  }

  return json as T
}

// ---------------------------------------------------------------------------
// Auth API functions
// ---------------------------------------------------------------------------

/** POST /api/signup → 201 { message } */
export async function signup(data: SignupRequest): Promise<{ message: string }> {
  return request<{ message: string }>('POST', '/signup', data)
}

/** POST /api/verify_email → 200 { message, email } */
export async function verifyEmail(token: string): Promise<{ message: string; email: string }> {
  return request<{ message: string; email: string }>('POST', '/verify_email', { token })
}

/** POST /api/resend_verification → 202 { message } (always, no account enumeration) */
export async function resendVerification(email: string): Promise<{ message: string }> {
  return request<{ message: string }>('POST', '/resend_verification', { email })
}

/** POST /api/login → 200 { user } and sets HttpOnly session cookie. */
export async function login(data: LoginRequest): Promise<LoginResponse> {
  return request<LoginResponse>('POST', '/login', data)
}

/**
 * DELETE /api/logout → 204.
 * Also clears the local CSRF cache since the session (and associated server
 * CSRF binding) is now gone.
 */
export async function logout(): Promise<void> {
  await request<void>('DELETE', '/logout')
  clearCsrfCache()
}

/** GET /api/me → 200 { user: {id,email} | null }. Always 200 (public probe). */
export async function getMe(): Promise<CurrentUser | null> {
  const res = await request<{ user: CurrentUser | null }>('GET', '/me')
  return res.user
}
