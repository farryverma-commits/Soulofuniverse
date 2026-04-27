import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { supabase } from '../services/supabaseClient'
import { setAuth, clearAuth } from '../store/authSlice'
import { RootState } from '../store'

export const useAuth = () => {
  const dispatch = useDispatch()
  const auth = useSelector((state: RootState) => state.auth)

  useEffect(() => {
    const fetchProfile = async (userId: string) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()
      
      return data?.role || 'student'
    }

    const handleAuthChange = async (session: any) => {
      if (session) {
        const role = await fetchProfile(session.user.id)
        dispatch(setAuth({
          user: {
            id: session.user.id,
            email: session.user.email,
            name: session.user.user_metadata?.name,
          },
          session: session,
          role: role
        }))
      } else {
        dispatch(clearAuth())
      }
    }

    // 1. Check active sessions on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleAuthChange(session)
    })

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleAuthChange(session)
    })

    return () => subscription.unsubscribe()
  }, [dispatch])

  return auth
}
