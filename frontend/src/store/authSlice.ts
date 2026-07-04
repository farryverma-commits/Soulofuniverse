import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'

export interface User {
  id: string
  email?: string
  name?: string
}

interface AuthState {
  user: User | null
  session: any | null
  role: 'admin' | 'student' | 'mentor' | null
  status: 'pending' | 'approved' | 'rejected' | null
  loading: boolean
}

const initialState: AuthState = {
  user: null,
  session: null,
  role: null,
  status: null,
  loading: true,
}

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuth: (state, action: PayloadAction<{ user: User | null; session: any; role: 'admin' | 'student' | 'mentor' | null; status: 'pending' | 'approved' | 'rejected' | null }>) => {
      state.user = action.payload.user
      state.session = action.payload.session
      state.role = action.payload.role
      state.status = action.payload.status
      state.loading = false
    },
    clearAuth: (state) => {
      state.user = null
      state.session = null
      state.role = null
      state.status = null
      state.loading = false
    },
  },
})

export const { setAuth, clearAuth } = authSlice.actions
export default authSlice.reducer
