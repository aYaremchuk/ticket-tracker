/**
 * Redux Toolkit store configuration.
 * TanStack Query owns server/cache state; this store owns client/session state
 * (current user, UI state). Keep slices lean.
 */

import { configureStore } from '@reduxjs/toolkit'
import type { TypedUseSelectorHook } from 'react-redux'
import { useDispatch, useSelector } from 'react-redux'
import authReducer from './authSlice.ts'

export const store = configureStore({
  reducer: {
    auth: authReducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

/** Typed dispatch hook — always use instead of plain `useDispatch`. */
export const useAppDispatch: () => AppDispatch = useDispatch

/** Typed selector hook — always use instead of plain `useSelector`. */
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector
