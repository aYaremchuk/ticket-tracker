/**
 * Auth slice — owns the current user and auth status.
 *
 * `status` state machine:
 *  'idle'            → initial, before any bootstrap attempt
 *  'loading'         → loadCurrentUser thunk in flight
 *  'authenticated'   → GET /api/me returned a user
 *  'unauthenticated' → GET /api/me returned { user: null } (or logout was called)
 *
 * The actual session is an HttpOnly cookie; we never store a token in JS.
 */

import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { getMe } from '../api/client.ts'
import type { CurrentUser } from '../types/api.ts'

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated'

export interface AuthState {
  user: CurrentUser | null
  status: AuthStatus
}

const initialState: AuthState = {
  user: null,
  status: 'idle',
}

/**
 * Bootstrap thunk: call GET /api/me on app load to restore any existing session.
 * The endpoint returns { user: null } (200) when logged out; a thrown error
 * (e.g. network failure) also resolves to 'unauthenticated' as a safe fallback.
 */
export const loadCurrentUser = createAsyncThunk(
  'auth/loadCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const user = await getMe()
      if (!user) return rejectWithValue(null)
      return user
    } catch {
      return rejectWithValue(null)
    }
  },
)

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** Called after a successful login response (sets user + authenticated). */
    setUser(state, action: PayloadAction<CurrentUser>) {
      state.user = action.payload
      state.status = 'authenticated'
    },
    /** Called after logout. */
    clearUser(state) {
      state.user = null
      state.status = 'unauthenticated'
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadCurrentUser.pending, (state) => {
        state.status = 'loading'
      })
      .addCase(loadCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload
        state.status = 'authenticated'
      })
      .addCase(loadCurrentUser.rejected, (state) => {
        state.user = null
        state.status = 'unauthenticated'
      })
  },
})

export const { setUser, clearUser } = authSlice.actions
export default authSlice.reducer
