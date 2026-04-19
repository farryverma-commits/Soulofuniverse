import { supabase } from '../../services/supabaseClient'

export const signInWithGoogle = async (role: 'student' | 'admin' = 'student') => {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/`,
      queryParams: {
        access_type: 'offline',
        prompt: 'select_account',
      },
      data: {
        role: role,
      }
    },
  })
  
  if (error) throw error
}
