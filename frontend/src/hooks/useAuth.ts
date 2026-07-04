import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { supabase } from '../services/supabaseClient'
import { setAuth, clearAuth } from '../store/authSlice'
import type { RootState } from '../store'

export const useAuth = () => {
  const dispatch = useDispatch()
  const auth = useSelector((state: RootState) => state.auth)

  useEffect(() => {
    const fetchProfile = async (userId: string) => {
      console.log('[useAuth] Fetching profile for user:', userId)
      
      // First try to fetch with status column
      const { data, error } = await supabase
        .from('profiles')
        .select('role, status')
        .eq('id', userId)
        .single()
      
      if (error) {
        console.error('[useAuth] Error fetching profile:', error)
        
        // If error is about missing column, try without status
        if (error.message?.includes('column') || error.code === '42703') {
          console.log('[useAuth] Status column might not exist, fetching without it')
          const { data: dataWithoutStatus, error: errorWithoutStatus } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', userId)
            .single()
          
          if (dataWithoutStatus) {
            const role = dataWithoutStatus.role || 'student'
            console.log('[useAuth] Profile without status:', dataWithoutStatus)
            return { role, status: role === 'admin' ? 'approved' : 'pending' }
          }
        }
        
        // If profile doesn't exist at all, check user metadata for role
        const { data: { user } } = await supabase.auth.getUser()
        const role = user?.user_metadata?.role || 'student'
        console.log('[useAuth] Using role from metadata:', role)
        return { role, status: role === 'admin' ? 'approved' : 'pending' }
      }
      
      console.log('[useAuth] Profile data:', data)
      
      // Admins bypass approval check - they always have access
      const role = data?.role || 'student'
      const status = role === 'admin' ? 'approved' : (data?.status || 'pending')
      
      console.log('[useAuth] Final role:', role, 'Final status:', status)
      return { role, status }
    }

    const handleAuthChange = async (session: any) => {
      console.log('[useAuth] Auth state changed, session:', !!session)
      
      if (session) {
        const { role, status } = await fetchProfile(session.user.id)
        dispatch(setAuth({
          user: {
            id: session.user.id,
            email: session.user.email,
            name: session.user.user_metadata?.name,
          },
          session: session,
          role: role,
          status: status
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
