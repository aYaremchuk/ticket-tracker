/**
 * Auth flow integration tests — mock the api/client layer, render real
 * components with a real Redux store and React Router, assert on UI outcomes.
 *
 * Covered:
 * - Login success → user is set in store + redirected to /board
 * - Login 403 email_unverified → resend verification banner shown
 * - Login 401 invalid_credentials → "Invalid email or password" shown
 * - Signup success → verification-sent confirmation shown
 * - Signup 409 conflict → email field error shown
 * - Signup client-side validation → password-length error shown
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as apiClient from '../api/client.ts'
import { LoginPage } from '../pages/LoginPage.tsx'
import { SignupPage } from '../pages/SignupPage.tsx'
import { store as realStore } from '../store/index.ts'
import { clearUser } from '../store/authSlice.ts'
import { configureStore } from '@reduxjs/toolkit'
import authReducer from '../store/authSlice.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStore() {
  return configureStore({ reducer: { auth: authReducer } })
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

interface RenderAuthOptions {
  initialPath?: string
}

function renderLoginPage(opts: RenderAuthOptions = {}) {
  const testStore = makeStore()
  const qc = makeQueryClient()
  const { initialPath = '/login' } = opts

  const utils = render(
    <Provider store={testStore}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            {/* Destination after successful login */}
            <Route path="/board" element={<div>Board page</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  )

  return { ...utils, testStore }
}

function renderSignupPage() {
  const testStore = makeStore()
  const qc = makeQueryClient()

  const utils = render(
    <Provider store={testStore}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/signup']}>
          <Routes>
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/login" element={<div>Login page</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  )

  return { ...utils, testStore }
}

// ---------------------------------------------------------------------------
// Login tests
// ---------------------------------------------------------------------------

describe('LoginPage', () => {
  beforeEach(() => {
    // Reset the real store auth state between tests if needed
    realStore.dispatch(clearUser())
    vi.restoreAllMocks()
  })

  it('login success → sets user in store and navigates to /board', async () => {
    vi.spyOn(apiClient, 'login').mockResolvedValue({
      user: { id: 'u1', email: 'alex@example.com' },
    })

    const { testStore } = renderLoginPage()

    await userEvent.type(screen.getByLabelText('Email'), 'alex@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(screen.getByText('Board page')).toBeInTheDocument()
    })

    expect(testStore.getState().auth.user).toEqual({ id: 'u1', email: 'alex@example.com' })
    expect(testStore.getState().auth.status).toBe('authenticated')
  })

  it('login 401 → shows "Invalid email or password" error', async () => {
    vi.spyOn(apiClient, 'login').mockRejectedValue(
      new apiClient.ApiError('invalid_credentials', 'Invalid credentials', 401),
    )

    renderLoginPage()

    await userEvent.type(screen.getByLabelText('Email'), 'alex@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'wrongpassword')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password.')
    })
  })

  it('login 403 email_unverified → shows resend verification banner', async () => {
    vi.spyOn(apiClient, 'login').mockRejectedValue(
      new apiClient.ApiError('email_unverified', 'Email not verified', 403),
    )

    renderLoginPage()

    await userEvent.type(screen.getByLabelText('Email'), 'alex@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        /Your account isn't verified yet/i,
      )
    })

    expect(
      screen.getByRole('button', { name: /resend verification email/i }),
    ).toBeInTheDocument()
  })

  it('resend verification button calls resendVerification with the email', async () => {
    vi.spyOn(apiClient, 'login').mockRejectedValue(
      new apiClient.ApiError('email_unverified', 'Email not verified', 403),
    )
    const resendSpy = vi
      .spyOn(apiClient, 'resendVerification')
      .mockResolvedValue({ message: 'sent' })

    renderLoginPage()

    await userEvent.type(screen.getByLabelText('Email'), 'alex@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /resend verification email/i })).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: /resend verification email/i }))

    await waitFor(() => {
      expect(resendSpy).toHaveBeenCalledWith('alex@example.com')
    })

    await waitFor(() => {
      expect(screen.getByText(/Verification email sent/i)).toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// Signup tests
// ---------------------------------------------------------------------------

describe('SignupPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('signup success → shows verification-sent confirmation', async () => {
    vi.spyOn(apiClient, 'signup').mockResolvedValue({ message: 'Verification email sent.' })

    renderSignupPage()

    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /sign up/i }))

    await waitFor(() => {
      expect(screen.getByText(/Verification email sent/i)).toBeInTheDocument()
    })

    expect(screen.getByText(/new@example.com/i)).toBeInTheDocument()
  })

  it('signup 409 → shows email-already-registered error', async () => {
    vi.spyOn(apiClient, 'signup').mockRejectedValue(
      new apiClient.ApiError('conflict', 'Email already registered', 409),
    )

    renderSignupPage()

    await userEvent.type(screen.getByLabelText('Email'), 'existing@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: /sign up/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('This email is already registered.')
    })
  })

  it('client-side validation → shows password-too-short error without calling API', async () => {
    const signupSpy = vi.spyOn(apiClient, 'signup')

    renderSignupPage()

    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'short')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'short')
    await userEvent.click(screen.getByRole('button', { name: /sign up/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Password must be at least 8 characters.',
      )
    })

    expect(signupSpy).not.toHaveBeenCalled()
  })

  it('client-side validation → shows password-mismatch error', async () => {
    const signupSpy = vi.spyOn(apiClient, 'signup')

    renderSignupPage()

    await userEvent.type(screen.getByLabelText('Email'), 'new@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'password123')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'different123')
    await userEvent.click(screen.getByRole('button', { name: /sign up/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.')
    })

    expect(signupSpy).not.toHaveBeenCalled()
  })
})
