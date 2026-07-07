/**
 * Password reset flow — ForgotPasswordPage + ResetPasswordPage.
 *
 * Covered:
 * - ForgotPasswordPage: submit → always shows neutral confirmation (no enumeration)
 * - ResetPasswordPage: missing token → shows invalid state immediately
 * - ResetPasswordPage: 200 → success + "Continue to login"
 * - ResetPasswordPage: 410 token_invalid → expired/invalid state
 * - ResetPasswordPage: 422 validation error → inline field error
 * - ResetPasswordPage: client-side password-length validation
 * - ResetPasswordPage: client-side password-mismatch validation
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import * as apiClient from '../api/client.ts'
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage.tsx'
import { ResetPasswordPage } from '../pages/ResetPasswordPage.tsx'
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

function renderForgotPassword() {
  const testStore = makeStore()
  const qc = makeQueryClient()
  render(
    <Provider store={testStore}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/forgot-password']}>
          <Routes>
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/login" element={<div>Login page</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  )
}

function renderResetPassword(token?: string) {
  const testStore = makeStore()
  const qc = makeQueryClient()
  const path = token ? `/reset-password?token=${token}` : '/reset-password'
  render(
    <Provider store={testStore}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/login" element={<div>Login page</div>} />
            <Route path="/forgot-password" element={<div>Forgot password page</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  )
}

// ---------------------------------------------------------------------------
// ForgotPasswordPage
// ---------------------------------------------------------------------------

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('submit → always shows neutral confirmation regardless of API response', async () => {
    vi.spyOn(apiClient, 'requestPasswordReset').mockResolvedValue({
      message: 'If the account exists, a password reset email was sent.',
    })

    renderForgotPassword()

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))

    await waitFor(() => {
      expect(screen.getByText(/Reset email sent/i)).toBeInTheDocument()
    })

    expect(
      screen.getByText(/If an account with that address exists/i),
    ).toBeInTheDocument()
    expect(apiClient.requestPasswordReset).toHaveBeenCalledWith('user@example.com')
  })

  it('shows confirmation even when the API throws (still no enumeration)', async () => {
    vi.spyOn(apiClient, 'requestPasswordReset').mockRejectedValue(
      new Error('Network error'),
    )

    renderForgotPassword()

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com')
    await userEvent.click(screen.getByRole('button', { name: /send reset link/i }))

    // The catch block swallows the error; the finally block always advances
    // to 'sent' — no error state is ever exposed to the user.
    await waitFor(() => {
      expect(screen.getByText(/Reset email sent/i)).toBeInTheDocument()
    })
  })

  it('renders "Back to log in" link', () => {
    renderForgotPassword()
    expect(screen.getByRole('link', { name: /back to log in/i })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// ResetPasswordPage
// ---------------------------------------------------------------------------

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('missing token → shows expired/invalid state immediately without calling API', () => {
    const spy = vi.spyOn(apiClient, 'confirmPasswordReset')
    renderResetPassword() // no token in URL

    expect(screen.getByText(/Expired or invalid link/i)).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('200 → shows success state + "Continue to login"', async () => {
    vi.spyOn(apiClient, 'confirmPasswordReset').mockResolvedValue({
      message: 'Password has been reset.',
    })

    renderResetPassword('valid-token-abc')

    await userEvent.type(screen.getByLabelText('New password'), 'newpassword1')
    await userEvent.type(
      screen.getByLabelText('Confirm new password'),
      'newpassword1',
    )
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }))

    await waitFor(() => {
      expect(screen.getByText(/Password updated/i)).toBeInTheDocument()
    })

    expect(screen.getByRole('link', { name: /continue to login/i })).toBeInTheDocument()
    expect(apiClient.confirmPasswordReset).toHaveBeenCalledWith(
      'valid-token-abc',
      'newpassword1',
    )
  })

  it('410 token_invalid → shows expired/invalid state', async () => {
    vi.spyOn(apiClient, 'confirmPasswordReset').mockRejectedValue(
      new apiClient.ApiError('token_invalid', 'Token has expired', 410),
    )

    renderResetPassword('expired-token')

    await userEvent.type(screen.getByLabelText('New password'), 'newpassword1')
    await userEvent.type(
      screen.getByLabelText('Confirm new password'),
      'newpassword1',
    )
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }))

    await waitFor(() => {
      expect(screen.getByText(/Expired or invalid link/i)).toBeInTheDocument()
    })

    expect(
      screen.getByRole('link', { name: /request a new reset link/i }),
    ).toBeInTheDocument()
  })

  it('422 validation error → shows inline password field error', async () => {
    vi.spyOn(apiClient, 'confirmPasswordReset').mockRejectedValue(
      new apiClient.ApiError(
        'validation_error',
        'Password is too short',
        422,
        { password: ['is too short (minimum is 8 characters)'] },
      ),
    )

    renderResetPassword('valid-token-xyz')

    // Pass client-side validation (≥8 chars, match) but fail server-side.
    await userEvent.type(screen.getByLabelText('New password'), 'password1')
    await userEvent.type(
      screen.getByLabelText('Confirm new password'),
      'password1',
    )
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'is too short (minimum is 8 characters)',
      )
    })
  })

  it('client-side validation → password too short error, no API call', async () => {
    const spy = vi.spyOn(apiClient, 'confirmPasswordReset')
    renderResetPassword('valid-token-abc')

    await userEvent.type(screen.getByLabelText('New password'), 'short')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'short')
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Password must be at least 8 characters.',
      )
    })

    expect(spy).not.toHaveBeenCalled()
  })

  it('client-side validation → passwords do not match, no API call', async () => {
    const spy = vi.spyOn(apiClient, 'confirmPasswordReset')
    renderResetPassword('valid-token-abc')

    await userEvent.type(screen.getByLabelText('New password'), 'password123')
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'different456')
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }))

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.')
    })

    expect(spy).not.toHaveBeenCalled()
  })
})
